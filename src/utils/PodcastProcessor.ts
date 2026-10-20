export interface SilenceRegion {
  id: number;
  start: number; // in seconds
  end: number;   // in seconds
  duration: number; // in seconds
  cut: boolean;  // whether user or engine marks it to cut
}

export interface SpeechRegion {
  start: number;
  end: number;
}

export interface SilenceDetectorOptions {
  thresholdDb: number;        // e.g. -36 dB (-60 to -20)
  maxSilenceDuration: number; // e.g. 0.6s (0.2 to 2.5)
  naturalPadding: number;     // e.g. 0.10s (0.05 to 0.30)
}

export interface MasteringOptions {
  voicePolish: boolean;
  autoLevel: boolean;
}

export interface ProcessMetrics {
  originalDuration: number;
  editedDuration: number;
  deadAirRemoved: number;
  timeSavedPercent: number;
  cutsCount: number;
}

/**
 * Decode an audio file (or buffer) using Web Audio API AudioContext.
 */
export async function decodeAudioFile(fileOrBuffer: File | ArrayBuffer): Promise<AudioBuffer> {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new AudioContextClass();
  try {
    let arrayBuffer: ArrayBuffer;
    if (fileOrBuffer instanceof File) {
      arrayBuffer = await fileOrBuffer.arrayBuffer();
    } else {
      arrayBuffer = fileOrBuffer;
    }
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    return audioBuffer;
  } finally {
    if (ctx.state !== 'closed') {
      await ctx.close();
    }
  }
}

/**
 * Scan audio buffer for silent gaps based on RMS energy and natural padding.
 */
export function detectSilenceRegions(
  audioBuffer: AudioBuffer,
  options: SilenceDetectorOptions
): SilenceRegion[] {
  const { thresholdDb, maxSilenceDuration, naturalPadding } = options;
  const sampleRate = audioBuffer.sampleRate;
  const duration = audioBuffer.duration;
  const numChannels = audioBuffer.numberOfChannels;

  // Analysis window: 25ms
  const windowSeconds = 0.025;
  const windowSize = Math.max(1, Math.floor(sampleRate * windowSeconds));
  const channelData: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channelData.push(audioBuffer.getChannelData(c));
  }

  const numWindows = Math.floor(audioBuffer.length / windowSize);
  const isSilentWindow: boolean[] = new Array(numWindows);

  // Linear threshold from dB: 10^(dB / 20)
  const linearThreshold = Math.pow(10, thresholdDb / 20);

  // Scan RMS in windows
  for (let w = 0; w < numWindows; w++) {
    const offset = w * windowSize;
    let sumSq = 0;
    for (let c = 0; c < numChannels; c++) {
      const data = channelData[c];
      for (let i = 0; i < windowSize; i++) {
        const val = data[offset + i] || 0;
        sumSq += val * val;
      }
    }
    const rms = Math.sqrt(sumSq / (windowSize * numChannels));
    isSilentWindow[w] = rms < linearThreshold;
  }

  // Group consecutive silent windows
  interface RawGap {
    start: number;
    end: number;
    duration: number;
  }

  const rawGaps: RawGap[] = [];
  let inGap = false;
  let gapStartWin = 0;

  for (let w = 0; w < numWindows; w++) {
    if (isSilentWindow[w]) {
      if (!inGap) {
        inGap = true;
        gapStartWin = w;
      }
    } else {
      if (inGap) {
        inGap = false;
        const startSec = gapStartWin * windowSeconds;
        const endSec = w * windowSeconds;
        rawGaps.push({
          start: startSec,
          end: endSec,
          duration: endSec - startSec,
        });
      }
    }
  }

  if (inGap) {
    const startSec = gapStartWin * windowSeconds;
    const endSec = numWindows * windowSeconds;
    rawGaps.push({
      start: startSec,
      end: endSec,
      duration: endSec - startSec,
    });
  }

  // Filter and compute cut silence regions using maxSilenceDuration and naturalPadding
  const silenceRegions: SilenceRegion[] = [];
  let idCounter = 1;

  for (const gap of rawGaps) {
    // Only gaps that exceed maxSilenceDuration are trimmed
    if (gap.duration >= maxSilenceDuration) {
      // Natural padding: Leave padding on speech boundaries and allow max natural gap
      // Left boundary of cut: gap.start + naturalPadding
      // Right boundary of cut: gap.end - naturalPadding
      const safePadding = Math.min(naturalPadding, gap.duration * 0.4);
      let cutStart = gap.start + safePadding;
      let cutEnd = gap.end - safePadding;

      // If cut length is significant (> 0.08s)
      if (cutEnd - cutStart > 0.08) {
        // Leave maxSilenceDuration room for natural breath
        const excess = (cutEnd - cutStart);
        if (excess > 0.05) {
          silenceRegions.push({
            id: idCounter++,
            start: Math.max(0, cutStart),
            end: Math.min(duration, cutEnd),
            duration: Math.max(0, cutEnd - cutStart),
            cut: true,
          });
        }
      }
    }
  }

  return silenceRegions;
}

/**
 * Calculate the active speech segments (regions to keep) from silence cuts.
 */
export function calculateKeptSegments(
  totalDuration: number,
  silenceRegions: SilenceRegion[]
): SpeechRegion[] {
  // Sort active cut regions by start time
  const activeCuts = silenceRegions
    .filter((r) => r.cut && r.end > r.start)
    .sort((a, b) => a.start - b.start);

  if (activeCuts.length === 0) {
    return [{ start: 0, end: totalDuration }];
  }

  const speechSegments: SpeechRegion[] = [];
  let currentPos = 0;

  for (const cut of activeCuts) {
    if (cut.start > currentPos + 0.02) {
      speechSegments.push({
        start: currentPos,
        end: cut.start,
      });
    }
    currentPos = Math.max(currentPos, cut.end);
  }

  if (currentPos < totalDuration - 0.02) {
    speechSegments.push({
      start: currentPos,
      end: totalDuration,
    });
  }

  return speechSegments;
}

/**
 * Compute editing metrics (Original length, new length, saved percent, cuts count).
 */
export function calculateMetrics(
  totalDuration: number,
  silenceRegions: SilenceRegion[]
): ProcessMetrics {
  const kept = calculateKeptSegments(totalDuration, silenceRegions);
  const editedDuration = kept.reduce((acc, seg) => acc + (seg.end - seg.start), 0);
  const deadAirRemoved = Math.max(0, totalDuration - editedDuration);
  const timeSavedPercent = totalDuration > 0 ? (deadAirRemoved / totalDuration) * 100 : 0;
  const cutsCount = silenceRegions.filter((r) => r.cut).length;

  return {
    originalDuration: totalDuration,
    editedDuration,
    deadAirRemoved,
    timeSavedPercent,
    cutsCount,
  };
}

/**
 * Render edited audio with 15ms cosine crossfades and optional mastering DSP
 * using an OfflineAudioContext.
 */
export async function renderEditedAudio(
  sourceBuffer: AudioBuffer,
  keptSegments: SpeechRegion[],
  mastering: MasteringOptions,
  onProgress?: (percent: number) => void
): Promise<AudioBuffer> {
  const sampleRate = sourceBuffer.sampleRate;
  const numChannels = sourceBuffer.numberOfChannels;

  if (keptSegments.length === 0) {
    throw new Error('No speech segments to export.');
  }

  // Crossfade duration: 15ms
  const crossfadeDuration = 0.015;
  const crossfadeSamples = Math.floor(sampleRate * crossfadeDuration);

  // Compute total samples needed
  let totalLengthSamples = 0;
  const segmentLengths: number[] = [];

  for (let i = 0; i < keptSegments.length; i++) {
    const seg = keptSegments[i];
    const segSamples = Math.floor((seg.end - seg.start) * sampleRate);
    segmentLengths.push(segSamples);
    totalLengthSamples += segSamples;
  }

  // Create temporary concatenated buffer in memory with micro-fades
  const offlineCtx = new OfflineAudioContext(numChannels, totalLengthSamples, sampleRate);
  const stitchedBuffer = offlineCtx.createBuffer(numChannels, totalLengthSamples, sampleRate);

  for (let ch = 0; ch < numChannels; ch++) {
    const srcData = sourceBuffer.getChannelData(ch);
    const destData = stitchedBuffer.getChannelData(ch);
    let destOffset = 0;

    for (let segIdx = 0; segIdx < keptSegments.length; segIdx++) {
      const seg = keptSegments[segIdx];
      const srcStartSample = Math.floor(seg.start * sampleRate);
      const segSamples = segmentLengths[segIdx];

      for (let i = 0; i < segSamples; i++) {
        let sample = srcData[srcStartSample + i] || 0;

        // Apply 15ms cosine fade-in at beginning of each segment
        if (i < crossfadeSamples) {
          const t = i / crossfadeSamples;
          const fadeIn = Math.sin((Math.PI / 2) * t);
          sample *= fadeIn;
        }

        // Apply 15ms cosine fade-out at end of each segment
        const remaining = segSamples - 1 - i;
        if (remaining < crossfadeSamples) {
          const t = remaining / crossfadeSamples;
          const fadeOut = Math.sin((Math.PI / 2) * t);
          sample *= fadeOut;
        }

        destData[destOffset + i] = sample;
      }
      destOffset += segSamples;
    }
  }

  if (onProgress) onProgress(40);

  // Now construct mastering DSP graph in OfflineAudioContext
  const sourceNode = offlineCtx.createBufferSource();
  sourceNode.buffer = stitchedBuffer;

  let lastNode: AudioNode = sourceNode;

  // 1. Podcast Voice Polish (80Hz Highpass + 3kHz Vocal Presence EQ + Vocal Compressor)
  if (mastering.voicePolish) {
    // 80Hz rumble high-pass filter
    const highpass = offlineCtx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 80;
    highpass.Q.value = 0.707;
    lastNode.connect(highpass);
    lastNode = highpass;

    // 3kHz vocal presence peaking EQ
    const presence = offlineCtx.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.value = 3000;
    presence.gain.value = 3.2; // +3.2 dB presence boost
    presence.Q.value = 1.0;
    lastNode.connect(presence);
    lastNode = presence;

    // Gentle vocal leveling compressor
    const compressor = offlineCtx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 12;
    compressor.ratio.value = 3.5;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.12;
    lastNode.connect(compressor);
    lastNode = compressor;
  }

  // 2. Auto-Level Volume (Peak & Loudness Normalization to broadcast -1dBFS)
  if (mastering.autoLevel) {
    // Scan peak amplitude
    let peak = 0;
    for (let ch = 0; ch < numChannels; ch++) {
      const data = stitchedBuffer.getChannelData(ch);
      for (let i = 0; i < data.length; i += 20) {
        const abs = Math.abs(data[i]);
        if (abs > peak) peak = abs;
      }
    }

    const targetPeak = 0.89; // -1 dBFS
    let gainMultiplier = 1.0;
    if (peak > 0.05 && peak < 0.75) {
      gainMultiplier = Math.min(2.5, targetPeak / peak);
    } else if (peak > 0.95) {
      gainMultiplier = targetPeak / peak;
    }

    const gainNode = offlineCtx.createGain();
    gainNode.gain.value = gainMultiplier;
    lastNode.connect(gainNode);
    lastNode = gainNode;
  }

  lastNode.connect(offlineCtx.destination);
  sourceNode.start(0);

  if (onProgress) onProgress(70);

  const renderedBuffer = await offlineCtx.startRendering();

  if (onProgress) onProgress(90);

  return renderedBuffer;
}

/**
 * Generate a realistic 22-second synthesized podcast audio sample
 * with deliberate dead-air silences and speech formants.
 * Allows users to test the app instantly with 1-click!
 */
export function generateSamplePodcastAudio(): AudioBuffer {
  const sampleRate = 44100;
  const duration = 21.0;
  const totalSamples = Math.floor(sampleRate * duration);

  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new AudioContextClass();
  const buffer = ctx.createBuffer(2, totalSamples, sampleRate);

  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  // Script schedule:
  // [0.5s - 4.0s]: Speaker 1: "Welcome to today's episode..."
  // [4.0s - 6.5s]: DEAD AIR SILENCE (2.5 seconds of awkward pause)
  // [6.5s - 10.5s]: Speaker 2: "Yeah, absolutely! Let's dive right in."
  // [10.5s - 12.8s]: DEAD AIR SILENCE (2.3 seconds)
  // [12.8s - 16.2s]: Speaker 1: "That is such an interesting perspective."
  // [16.2s - 18.2s]: DEAD AIR SILENCE (2.0 seconds)
  // [18.2s - 20.8s]: Speaker 2: "Thanks for listening everyone, catch you next week!"

  const speechWindows = [
    { start: 0.6, end: 4.2, f0: 130, pan: -0.2 },
    { start: 6.8, end: 10.5, f0: 210, pan: 0.25 },
    { start: 12.8, end: 16.3, f0: 135, pan: -0.15 },
    { start: 18.2, end: 20.7, f0: 205, pan: 0.2 },
  ];

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;

    // Room tone / faint studio ambient floor (-65dB)
    const roomTone = (Math.random() * 2 - 1) * 0.0003;
    left[i] = roomTone;
    right[i] = roomTone;

    // Check if in speech window
    for (const win of speechWindows) {
      if (t >= win.start && t <= win.end) {
        const segT = t - win.start;
        const segLen = win.end - win.start;

        // Envelope with smooth syllables (vowel cadence)
        const syllableRate = 4.2; // 4.2 syllables per second
        const syllableMod = 0.5 + 0.5 * Math.sin(2 * Math.PI * syllableRate * segT);
        const breathFade = Math.sin((Math.PI * segT) / segLen);

        // Formant synthesis for speech warmth
        const f0 = win.f0 + 8 * Math.sin(2 * Math.PI * 1.5 * segT); // pitch vibrato/intonation
        const h1 = Math.sin(2 * Math.PI * f0 * t) * 0.4;
        const h2 = Math.sin(2 * Math.PI * f0 * 2 * t) * 0.3;
        const h3 = Math.sin(2 * Math.PI * f0 * 3 * t) * 0.2;
        const fPresence = Math.sin(2 * Math.PI * 2800 * t) * 0.05; // 2.8kHz consonant energy

        const speechSignal = (h1 + h2 + h3 + fPresence) * syllableMod * breathFade * 0.65;

        // Stereo panning
        const leftGain = 0.5 * (1 - win.pan);
        const rightGain = 0.5 * (1 + win.pan);

        left[i] += speechSignal * leftGain;
        right[i] += speechSignal * rightGain;
      }
    }
  }

  if (ctx.state !== 'closed') {
    ctx.close();
  }

  return buffer;
}

/**
 * Format seconds into mm:ss or mm:ss.d
 */
export function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  const paddedMins = mins.toString().padStart(2, '0');
  const paddedSecs = secs.toString().padStart(2, '0');
  return `${paddedMins}:${paddedSecs}.${ms}`;
}

/**
 * Format duration into human readable string e.g. "1m 12s" or "3.4s"
 */
export function formatDurationHuman(seconds: number): string {
  if (isNaN(seconds) || seconds <= 0) return '0s';
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(1);
  if (mins > 0) {
    return `${mins}m ${Math.floor(seconds % 60)}s`;
  }
  return `${secs}s`;
}
