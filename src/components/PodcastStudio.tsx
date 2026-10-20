import React, { useState, useRef, useEffect, useCallback } from 'react';
import confetti from 'canvas-confetti';
import {
  Play,
  Pause,
  Square,
  Sliders,
  Scissors,
  Wand2,
  Download,
  UploadCloud,
  FileAudio,
  Sparkles,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  CheckCircle2,
  ShieldCheck,
  Zap,
  Info,
  AlertCircle,
} from 'lucide-react';
import {
  decodeAudioFile,
  detectSilenceRegions,
  calculateKeptSegments,
  calculateMetrics,
  renderEditedAudio,
  generateSamplePodcastAudio,
  formatTime,
  formatDurationHuman,
  type SilenceRegion,
  type SpeechRegion,
  type ProcessMetrics,
} from '../utils/PodcastProcessor';
import { encodeWav, encodeMp3 } from '../utils/audioEncoder';
import { translations, defaultLang, type SupportedLanguage } from '../i18n/ui';

interface Props {
  currentLang?: string;
}

export default function PodcastStudio({ currentLang = defaultLang }: Props) {
  const t = translations[currentLang as SupportedLanguage] || translations.en;

  // Audio State
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [isDecoding, setIsDecoding] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sliders State
  const [thresholdDb, setThresholdDb] = useState<number>(-36);
  const [maxSilenceDuration, setMaxSilenceDuration] = useState<number>(0.6);
  const [naturalPadding, setNaturalPadding] = useState<number>(0.1);

  // Mastering Toggles
  const [voicePolish, setVoicePolish] = useState<boolean>(true);
  const [autoLevel, setAutoLevel] = useState<boolean>(true);
  const [skipSilencesInPreview, setSkipSilencesInPreview] = useState<boolean>(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);

  // Export State
  const [exportFormat, setExportFormat] = useState<'wav' | 'mp3'>('mp3');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [exportSuccess, setExportSuccess] = useState<boolean>(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Silence Regions & Metrics
  const [silenceRegions, setSilenceRegions] = useState<SilenceRegion[]>([]);
  const [metrics, setMetrics] = useState<ProcessMetrics>({
    originalDuration: 0,
    editedDuration: 0,
    deadAirRemoved: 0,
    timeSavedPercent: 0,
    cutsCount: 0,
  });

  // Playback & UI State
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);

  // High-Performance Audio Playback & Animation Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const isPlayingRef = useRef<boolean>(false);
  const playheadTimeRef = useRef<number>(0);
  const playbackStartedAtRef = useRef<number>(0);
  const startTimeOffsetRef = useRef<number>(0);
  const playbackSpeedRef = useRef<number>(1.0);
  const skipSilencesRef = useRef<boolean>(true);
  const voicePolishRef = useRef<boolean>(true);
  const animationFrameRef = useRef<number | null>(null);

  // Sync ref mirrors
  playbackSpeedRef.current = playbackSpeed;
  skipSilencesRef.current = skipSilencesInPreview;
  voicePolishRef.current = voicePolish;

  // Canvas & Offscreen Buffer Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const playheadTimeTextRef = useRef<HTMLSpanElement | null>(null);
  const waveformPeaksRef = useRef<Float32Array | null>(null);
  const silenceRegionsRef = useRef<SilenceRegion[]>([]);
  silenceRegionsRef.current = silenceRegions;

  // Recalculate Silence Detection
  const runSilenceDetection = useCallback(
    (buf: AudioBuffer) => {
      const regions = detectSilenceRegions(buf, {
        thresholdDb,
        maxSilenceDuration,
        naturalPadding,
      });
      setSilenceRegions(regions);
      const calculatedMetrics = calculateMetrics(buf.duration, regions);
      setMetrics(calculatedMetrics);
    },
    [thresholdDb, maxSilenceDuration, naturalPadding]
  );

  // Pre-calculate 2000 Waveform Peaks for instant canvas drawing
  const generateWaveformPeaks = useCallback((buf: AudioBuffer) => {
    const numSamples = 2000;
    const peaks = new Float32Array(numSamples);
    const left = buf.getChannelData(0);
    const right = buf.numberOfChannels > 1 ? buf.getChannelData(1) : left;
    const step = Math.max(1, Math.floor(buf.length / numSamples));

    for (let i = 0; i < numSamples; i++) {
      let max = 0;
      const start = i * step;
      const end = Math.min(start + step, buf.length);
      for (let j = start; j < end; j += 4) {
        const valL = Math.abs(left[j] || 0);
        const valR = Math.abs(right[j] || 0);
        const val = Math.max(valL, valR);
        if (val > max) max = val;
      }
      peaks[i] = max;
    }
    waveformPeaksRef.current = peaks;
  }, []);

  // Bake Background Waveform into Offscreen Canvas
  const bakeBackgroundWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !audioBuffer || !waveformPeaksRef.current) return;

    const width = canvas.width;
    const height = canvas.height;
    const duration = audioBuffer.duration;
    const peaks = waveformPeaksRef.current;
    const regions = silenceRegionsRef.current;
    const isDark = document.documentElement.classList.contains('dark');

    // Create or resize offscreen canvas
    if (!offscreenCanvasRef.current) {
      offscreenCanvasRef.current = document.createElement('canvas');
    }
    const offCanvas = offscreenCanvasRef.current;
    offCanvas.width = width;
    offCanvas.height = height;

    const ctx = offCanvas.getContext('2d');
    if (!ctx) return;

    // Clear and fill background
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = isDark ? '#202734' : '#F9FCF6';
    ctx.fillRect(0, 0, width, height);

    // Baseline
    const centerY = height / 2;
    ctx.strokeStyle = isDark ? '#36415A' : '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

    // 1. Draw Silence Cut Regions
    for (const region of regions) {
      const xStart = (region.start / duration) * width;
      const xEnd = (region.end / duration) * width;
      const regWidth = Math.max(2, xEnd - xStart);

      if (region.cut) {
        ctx.fillStyle = isDark ? 'rgba(239, 68, 68, 0.28)' : 'rgba(239, 68, 68, 0.18)';
        ctx.fillRect(xStart, 0, regWidth, height);

        ctx.strokeStyle = isDark ? 'rgba(239, 68, 68, 0.7)' : 'rgba(239, 68, 68, 0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(xStart, 0, regWidth, height);

        ctx.fillStyle = isDark ? '#F87171' : '#DC2626';
        ctx.font = '10px Inter, sans-serif';
        if (regWidth > 35) {
          ctx.fillText(`✂ -${region.duration.toFixed(1)}s`, xStart + 4, 16);
        }
      } else {
        ctx.fillStyle = isDark ? 'rgba(54, 65, 90, 0.4)' : 'rgba(224, 248, 199, 0.35)';
        ctx.fillRect(xStart, 0, regWidth, height);
      }
    }

    // 2. Draw Unplayed Waveform Bars
    const numBars = peaks.length;
    const barWidth = width / numBars;

    for (let i = 0; i < numBars; i++) {
      const peak = peaks[i];
      const barHeight = Math.max(2, peak * (height * 0.42));
      const x = i * barWidth;
      const timeAtBar = (i / numBars) * duration;

      let inCut = false;
      for (const cut of regions) {
        if (cut.cut && timeAtBar >= cut.start && timeAtBar <= cut.end) {
          inCut = true;
          break;
        }
      }

      ctx.fillStyle = inCut ? (isDark ? '#7F1D1D' : '#FCA5A5') : (isDark ? '#4A5568' : '#36415A');
      const topY = centerY - barHeight;
      const barThickness = Math.max(1, barWidth - 0.5);
      ctx.fillRect(x, topY, barThickness, barHeight * 2);
    }

    // 3. Time Scale Ticks
    ctx.fillStyle = isDark ? '#94A3B8' : '#64748B';
    ctx.font = '10px JetBrains Mono, monospace';
    const intervalSecs = duration > 120 ? 30 : duration > 60 ? 15 : 5;
    for (let s = 0; s <= duration; s += intervalSecs) {
      const x = (s / duration) * width;
      ctx.fillText(`${s}s`, x + 3, height - 6);
    }
  }, [audioBuffer]);

  // Fast Sub-Millisecond Frame Renderer (called 60fps)
  const renderCanvasFrame = useCallback(
    (time: number) => {
      const canvas = canvasRef.current;
      const offscreen = offscreenCanvasRef.current;
      if (!canvas || !offscreen || !audioBuffer || !waveformPeaksRef.current) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;
      const duration = audioBuffer.duration;
      const peaks = waveformPeaksRef.current;
      const regions = silenceRegionsRef.current;
      const numBars = peaks.length;
      const barWidth = width / numBars;
      const centerY = height / 2;

      // 1. Copy pre-baked background in 0.02ms!
      ctx.drawImage(offscreen, 0, 0);

      // 2. Overlay glowing green speech bars up to playhead time
      const playheadBarIndex = Math.min(numBars, Math.floor((time / duration) * numBars));
      ctx.fillStyle = '#B7D894';

      for (let i = 0; i <= playheadBarIndex; i++) {
        const timeAtBar = (i / numBars) * duration;
        let inCut = false;
        for (let r = 0; r < regions.length; r++) {
          const cut = regions[r];
          if (cut.cut && timeAtBar >= cut.start && timeAtBar <= cut.end) {
            inCut = true;
            break;
          }
        }
        if (!inCut) {
          const peak = peaks[i];
          const barHeight = Math.max(2, peak * (height * 0.42));
          const topY = centerY - barHeight;
          const x = i * barWidth;
          ctx.fillRect(x, topY, Math.max(1, barWidth - 0.5), barHeight * 2);
        }
      }

      // 3. Draw High-Contrast Moving Playhead Line
      const playheadX = Math.max(0, Math.min(width, (time / duration) * width));
      ctx.strokeStyle = '#B7D894';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = 'rgba(183, 216, 148, 0.8)';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Playhead circle thumb
      ctx.fillStyle = '#B7D894';
      ctx.beginPath();
      ctx.arc(playheadX, 8, 5, 0, Math.PI * 2);
      ctx.fill();

      // 4. Update Header Time Display directly in DOM without React re-render
      if (playheadTimeTextRef.current) {
        playheadTimeTextRef.current.textContent = `[${formatTime(time)} / ${formatTime(duration)}]`;
      }
    },
    [audioBuffer]
  );

  // Stop Playback
  const stopPlayback = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (sourceNodeRef.current) {
      const src = sourceNodeRef.current;
      sourceNodeRef.current = null;
      src.onended = null;
      try { src.stop(0); } catch (e) {}
      try { src.disconnect(); } catch (e) {}
    }

    isPlayingRef.current = false;
    setIsPlaying(false);
  }, []);

  // Authoritative Playback from offset
  const playFromOffset = useCallback(
    (offsetSeconds: number) => {
      if (!audioBuffer) return;

      // Ensure AudioContext
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        audioContextRef.current = new AudioCtx();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      // Stop previous node cleanly
      if (sourceNodeRef.current) {
        const src = sourceNodeRef.current;
        sourceNodeRef.current = null;
        src.onended = null;
        try { src.stop(0); } catch (e) {}
        try { src.disconnect(); } catch (e) {}
      }

      let safeOffset = offsetSeconds;
      if (safeOffset >= audioBuffer.duration - 0.05 || safeOffset < 0) {
        safeOffset = 0;
      }

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.playbackRate.value = playbackSpeedRef.current;

      let lastNode: AudioNode = source;

      // Realtime Preview Filter Chain
      if (voicePolishRef.current) {
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 80;
        lastNode.connect(hp);
        lastNode = hp;

        const presence = ctx.createBiquadFilter();
        presence.type = 'peaking';
        presence.frequency.value = 3000;
        presence.gain.value = 3.2;
        lastNode.connect(presence);
        lastNode = presence;
      }

      lastNode.connect(ctx.destination);

      try {
        source.start(0, safeOffset);
      } catch (err) {
        console.error('Audio start error:', err);
        return;
      }

      sourceNodeRef.current = source;
      startTimeOffsetRef.current = safeOffset;
      playbackStartedAtRef.current = ctx.currentTime;
      playheadTimeRef.current = safeOffset;
      isPlayingRef.current = true;
      setIsPlaying(true);

      // Dedicated 60fps Animation Loop
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      const animationStep = () => {
        if (!isPlayingRef.current || !audioContextRef.current || sourceNodeRef.current !== source) {
          return;
        }

        const elapsed = (ctx.currentTime - playbackStartedAtRef.current) * playbackSpeedRef.current;
        const nowTime = startTimeOffsetRef.current + elapsed;

        // Skip Silences in preview check
        if (skipSilencesRef.current) {
          const cuts = silenceRegionsRef.current;
          for (let i = 0; i < cuts.length; i++) {
            const cut = cuts[i];
            if (cut.cut && nowTime >= cut.start && nowTime < cut.end) {
              // Seamlessly leap forward across dead air
              const nextTime = Math.min(cut.end + 0.01, audioBuffer.duration - 0.05);
              playFromOffset(nextTime);
              return;
            }
          }
        }

        if (nowTime >= audioBuffer.duration) {
          stopPlayback();
          playheadTimeRef.current = 0;
          renderCanvasFrame(0);
          return;
        }

        playheadTimeRef.current = nowTime;
        renderCanvasFrame(nowTime);

        animationFrameRef.current = requestAnimationFrame(animationStep);
      };

      animationFrameRef.current = requestAnimationFrame(animationStep);

      source.onended = () => {
        if (sourceNodeRef.current === source) {
          stopPlayback();
          playheadTimeRef.current = 0;
          renderCanvasFrame(0);
        }
      };
    },
    [audioBuffer, renderCanvasFrame, stopPlayback]
  );

  // Seek / Scrub directly to position
  const seekTo = useCallback(
    (targetTime: number) => {
      if (!audioBuffer) return;
      const safeTime = Math.max(0, Math.min(targetTime, audioBuffer.duration));
      playheadTimeRef.current = safeTime;

      if (isPlayingRef.current) {
        playFromOffset(safeTime);
      } else {
        renderCanvasFrame(safeTime);
      }
    },
    [audioBuffer, playFromOffset, renderCanvasFrame]
  );

  // Toggle Play / Pause
  const togglePlayPause = () => {
    if (isPlaying) {
      stopPlayback();
      renderCanvasFrame(playheadTimeRef.current);
    } else {
      playFromOffset(playheadTimeRef.current);
    }
  };

  // Re-bake background whenever buffer, cuts, or zoom changes
  useEffect(() => {
    bakeBackgroundWaveform();
    renderCanvasFrame(playheadTimeRef.current);
  }, [bakeBackgroundWaveform, renderCanvasFrame, silenceRegions]);

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (canvas && container) {
        canvas.width = Math.round(container.clientWidth * zoomLevel);
        canvas.height = 180;
        bakeBackgroundWaveform();
        renderCanvasFrame(playheadTimeRef.current);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [zoomLevel, bakeBackgroundWaveform, renderCanvasFrame]);

  // Canvas Click / Scrub / Silence Toggle
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !audioBuffer) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = clickX / canvas.width;
    const clickedTime = ratio * audioBuffer.duration;

    const clickedRegion = silenceRegions.find(
      (r) => clickedTime >= r.start && clickedTime <= r.end
    );

    if (clickedRegion) {
      toggleRegion(clickedRegion.id);
    } else {
      seekTo(clickedTime);
    }
  };

  // Handle File Load
  const handleFile = async (file: File) => {
    try {
      setIsDecoding(true);
      setErrorMessage(null);
      setExportSuccess(false);
      setExportError(null);
      stopPlayback();

      const decoded = await decodeAudioFile(file);
      setAudioBuffer(decoded);
      setFileName(file.name);
      generateWaveformPeaks(decoded);
      runSilenceDetection(decoded);
      playheadTimeRef.current = 0;
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err?.message || t.dropzone.errorDecoding);
    } finally {
      setIsDecoding(false);
    }
  };

  // Handle Sample Podcast Click
  const handleLoadSample = () => {
    try {
      setIsDecoding(true);
      setErrorMessage(null);
      setExportSuccess(false);
      setExportError(null);
      stopPlayback();

      const sample = generateSamplePodcastAudio();
      setAudioBuffer(sample);
      setFileName('podcast-interview-sample.wav');
      generateWaveformPeaks(sample);
      runSilenceDetection(sample);
      playheadTimeRef.current = 0;
    } catch (err: any) {
      console.error(err);
      setErrorMessage(t.dropzone.errorDecoding);
    } finally {
      setIsDecoding(false);
    }
  };

  // Export Pipeline
  const handleExport = async () => {
    if (!audioBuffer) return;

    try {
      setIsExporting(true);
      setExportProgress(10);
      setExportSuccess(false);
      setExportError(null);
      stopPlayback();

      const renderedBuffer = await renderEditedAudio(
        audioBuffer,
        keptSegments,
        { voicePolish, autoLevel },
        (progress) => setExportProgress(Math.min(90, Math.round(progress)))
      );

      let blob: Blob;
      let extension: string;

      if (exportFormat === 'wav') {
        setExportProgress(95);
        blob = encodeWav(renderedBuffer);
        extension = 'wav';
      } else {
        blob = await encodeMp3(renderedBuffer, (prog) => {
          setExportProgress(Math.min(98, 70 + Math.round(prog * 0.28)));
        });
        extension = 'mp3';
      }

      setExportProgress(100);

      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const baseName = fileName.replace(/\.[^/.]+$/, '') || 'podcast-edited';
      anchor.href = downloadUrl;
      anchor.download = `${baseName}-podedited.${extension}`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);

      setTimeout(() => URL.revokeObjectURL(downloadUrl), 8000);
      setExportSuccess(true);

      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#B7D894', '#E0F8C7', '#202734'],
        });
      } catch (e) {}
    } catch (err: any) {
      console.error('Export failed:', err);
      setExportError(err?.message || 'Export error occurred. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-6">
      {/* 1. DROPZONE / LOCAL LOADER */}
      {!audioBuffer && (
        <div className="bg-white dark:bg-navy/50 border-2 border-dashed border-lime/60 dark:border-lime/40 rounded-3xl p-8 md:p-14 text-center shadow-soft-card transition-all hover:border-lime">
          <div className="w-16 h-16 md:w-20 md:h-20 mx-auto mb-6 rounded-2xl bg-mint/50 dark:bg-navy flex items-center justify-center text-midnight dark:text-lime shadow-inner">
            <UploadCloud className="w-8 h-8 md:w-10 md:h-10 animate-pulse-slow" />
          </div>

          <h2 className="text-2xl md:text-3xl font-extrabold text-midnight dark:text-canvas mb-3">
            {t.dropzone.dragDropTitle}
          </h2>
          <p className="text-navy dark:text-canvas/80 text-sm md:text-base max-w-xl mx-auto mb-8">
            {t.dropzone.dragDropSubtitle}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <label className="cursor-pointer bg-midnight hover:bg-midnight/90 dark:bg-lime dark:hover:bg-lime/90 text-canvas dark:text-midnight font-bold px-7 py-3.5 rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95 flex items-center gap-2">
              <FileAudio className="w-5 h-5" />
              <span>{t.dropzone.browseFiles}</span>
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
            </label>

            <button
              onClick={handleLoadSample}
              className="bg-mint/70 hover:bg-mint dark:bg-navy hover:dark:bg-navy/80 text-midnight dark:text-lime font-bold px-6 py-3.5 rounded-full border border-lime/40 transition-transform hover:scale-105 active:scale-95 flex items-center gap-2"
            >
              <Sparkles className="w-5 h-5 text-midnight dark:text-lime" />
              <span>{t.dropzone.trySample}</span>
            </button>
          </div>

          <div className="mt-8 flex items-center justify-center gap-2 text-xs text-navy/70 dark:text-canvas/60">
            <ShieldCheck className="w-4 h-4 text-lime" />
            <span>100% Client-Side. Your audio never touches a server.</span>
          </div>

          {isDecoding && (
            <div className="mt-6 flex items-center justify-center gap-3 text-sm font-semibold text-midnight dark:text-lime">
              <div className="w-5 h-5 border-2 border-lime border-t-transparent rounded-full animate-spin" />
              <span>{t.dropzone.loadingAudio}</span>
            </div>
          )}

          {errorMessage && (
            <div className="mt-6 p-4 rounded-xl bg-red-100 text-red-700 text-sm font-medium flex items-center justify-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>
      )}

      {/* 2. PODCAST STUDIO INTERFACE */}
      {audioBuffer && (
        <div className="space-y-6">
          {/* Top Audio File Bar & Reset */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-navy p-4 rounded-2xl shadow-soft-card border border-lime/30">
            <div className="flex items-center gap-3 truncate">
              <div className="w-10 h-10 rounded-xl bg-mint dark:bg-midnight flex items-center justify-center text-midnight dark:text-lime shrink-0">
                <FileAudio className="w-5 h-5" />
              </div>
              <div className="truncate">
                <div className="font-bold text-midnight dark:text-canvas truncate text-sm md:text-base">
                  {fileName}
                </div>
                <div className="text-xs text-navy dark:text-canvas/70 font-mono">
                  {audioBuffer.numberOfChannels} ch • {audioBuffer.sampleRate} Hz •{' '}
                  {formatDurationHuman(audioBuffer.duration)}
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                stopPlayback();
                setAudioBuffer(null);
                setSilenceRegions([]);
              }}
              className="text-xs font-semibold px-4 py-2 rounded-xl bg-canvas dark:bg-midnight text-navy dark:text-canvas/80 hover:text-midnight dark:hover:text-canvas hover:border-lime border border-transparent transition-colors flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t.export.loadNew}</span>
            </button>
          </div>

          {/* MOTIVATING STATS METRICS BAR */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
            <div className="bg-white dark:bg-navy p-4 rounded-2xl border border-slate-200 dark:border-navy/80 shadow-soft-card">
              <div className="text-xs text-navy/70 dark:text-canvas/60 font-medium mb-1">
                {t.metrics.originalDuration}
              </div>
              <div className="text-lg md:text-xl font-extrabold text-midnight dark:text-canvas font-mono">
                {formatTime(metrics.originalDuration)}
              </div>
            </div>

            <div className="bg-mint/40 dark:bg-navy p-4 rounded-2xl border border-lime/40 shadow-soft-card">
              <div className="text-xs text-navy/70 dark:text-canvas/60 font-medium mb-1 flex items-center justify-between">
                <span>{t.metrics.editedDuration}</span>
                <span className="text-[10px] font-bold text-emerald-700 dark:text-lime bg-lime/30 px-1.5 py-0.5 rounded-full">
                  -{metrics.timeSavedPercent.toFixed(1)}%
                </span>
              </div>
              <div className="text-lg md:text-xl font-extrabold text-emerald-800 dark:text-lime font-mono">
                {formatTime(metrics.editedDuration)}
              </div>
            </div>

            <div className="bg-white dark:bg-navy p-4 rounded-2xl border border-slate-200 dark:border-navy/80 shadow-soft-card">
              <div className="text-xs text-navy/70 dark:text-canvas/60 font-medium mb-1">
                {t.metrics.deadAirRemoved}
              </div>
              <div className="text-lg md:text-xl font-extrabold text-midnight dark:text-canvas font-mono">
                {formatDurationHuman(metrics.deadAirRemoved)}
              </div>
            </div>

            <div className="bg-white dark:bg-navy p-4 rounded-2xl border border-slate-200 dark:border-navy/80 shadow-soft-card">
              <div className="text-xs text-navy/70 dark:text-canvas/60 font-medium mb-1">
                {t.metrics.cutsCount}
              </div>
              <div className="text-lg md:text-xl font-extrabold text-midnight dark:text-canvas font-mono flex items-center gap-2">
                <Scissors className="w-4 h-4 text-rose-500" />
                <span>{metrics.cutsCount}</span>
              </div>
            </div>
          </div>

          {/* INTERACTIVE WAVEFORM CANVAS CARD */}
          <div className="bg-white dark:bg-midnight rounded-3xl p-4 md:p-6 border border-lime/40 shadow-soft-card">
            {/* Waveform Controls Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${isPlaying ? 'bg-emerald-500 animate-ping' : 'bg-lime'}`} />
                <span className="text-xs md:text-sm font-bold text-midnight dark:text-canvas">
                  Interactive Waveform
                </span>
                <span
                  ref={playheadTimeTextRef}
                  className="text-xs text-navy/80 dark:text-canvas/70 font-mono font-bold"
                >
                  [{formatTime(0)} / {formatTime(audioBuffer.duration)}]
                </span>
              </div>

              {/* Zoom controls */}
              <div className="flex items-center gap-1.5 bg-canvas dark:bg-navy p-1 rounded-xl">
                <button
                  onClick={() => setZoomLevel((z) => Math.max(1.0, parseFloat((z - 0.5).toFixed(1))))}
                  className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-midnight text-navy dark:text-canvas transition-colors"
                  title={t.mastering.zoomOut}
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-[11px] font-mono px-1 font-semibold text-midnight dark:text-canvas">
                  {zoomLevel.toFixed(1)}x
                </span>
                <button
                  onClick={() => setZoomLevel((z) => Math.min(4.0, parseFloat((z + 0.5).toFixed(1))))}
                  className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-midnight text-navy dark:text-canvas transition-colors"
                  title={t.mastering.zoomIn}
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setZoomLevel(1.0)}
                  className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-midnight text-navy dark:text-canvas transition-colors"
                  title={t.mastering.resetZoom}
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Scrollable Canvas Container */}
            <div
              ref={containerRef}
              className="w-full overflow-x-auto rounded-2xl border border-slate-200 dark:border-navy bg-canvas dark:bg-midnight cursor-crosshair select-none relative"
            >
              <canvas
                ref={canvasRef}
                onClick={handleCanvasClick}
                className="block h-[180px]"
                style={{ width: `${zoomLevel * 100}%`, minWidth: '100%' }}
              />
            </div>

            {/* Interactive Tip Banner */}
            <div className="mt-3 flex items-center gap-2 text-xs text-navy/80 dark:text-canvas/70 bg-mint/30 dark:bg-navy/40 px-3 py-2 rounded-xl">
              <Info className="w-4 h-4 text-emerald-600 dark:text-lime shrink-0" />
              <span>{t.controls.toggleInstructions}</span>
            </div>

            {/* PLAYBACK TRANSPORT BAR */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-slate-100 dark:border-navy">
              {/* Play / Pause / Stop */}
              <div className="flex items-center gap-2">
                <button
                  onClick={togglePlayPause}
                  className="w-12 h-12 rounded-2xl bg-midnight hover:bg-midnight/90 dark:bg-lime dark:hover:bg-lime/90 text-canvas dark:text-midnight flex items-center justify-center shadow-md transition-transform hover:scale-105 active:scale-95"
                  title={isPlaying ? t.mastering.pause : t.mastering.play}
                >
                  {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 ml-0.5 fill-current" />}
                </button>

                <button
                  onClick={() => {
                    stopPlayback();
                    seekTo(0);
                  }}
                  className="w-10 h-10 rounded-xl bg-canvas dark:bg-navy hover:bg-slate-200 dark:hover:bg-navy/80 text-navy dark:text-canvas flex items-center justify-center transition-colors"
                  title={t.mastering.stop}
                >
                  <Square className="w-4 h-4 fill-current" />
                </button>

                {/* Speed buttons */}
                <div className="flex items-center bg-canvas dark:bg-navy rounded-xl p-1 gap-1 text-xs font-semibold">
                  {[1.0, 1.25, 1.5, 2.0].map((spd) => (
                    <button
                      key={spd}
                      onClick={() => {
                        setPlaybackSpeed(spd);
                        if (sourceNodeRef.current) {
                          sourceNodeRef.current.playbackRate.value = spd;
                        }
                      }}
                      className={`px-2.5 py-1 rounded-lg transition-colors ${
                        playbackSpeed === spd
                          ? 'bg-midnight text-canvas dark:bg-lime dark:text-midnight font-bold'
                          : 'text-navy dark:text-canvas/70 hover:text-midnight dark:hover:text-canvas'
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Audition Edits (Skip Silences) Live Switch */}
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer text-xs md:text-sm font-semibold text-midnight dark:text-canvas">
                  <input
                    type="checkbox"
                    checked={skipSilencesInPreview}
                    onChange={(e) => setSkipSilencesInPreview(e.target.checked)}
                    className="w-4 h-4 rounded text-lime focus:ring-lime"
                  />
                  <Zap className="w-4 h-4 text-amber-500" />
                  <span>{t.mastering.skipSilencesPreview}</span>
                </label>
              </div>
            </div>
          </div>

          {/* CONTROLS DECK: 2 COLUMNS (Silence Remover Engine + Pro Voice Polish) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Column A: Silence Remover Sliders */}
            <div className="bg-white dark:bg-navy p-6 rounded-3xl border border-slate-200 dark:border-navy shadow-soft-card space-y-5">
              <div className="flex items-center gap-2.5">
                <Sliders className="w-5 h-5 text-midnight dark:text-lime" />
                <h3 className="font-bold text-midnight dark:text-canvas text-base md:text-lg">
                  {t.controls.sectionTitle}
                </h3>
              </div>

              {/* Slider 1: Silence Threshold */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs md:text-sm font-semibold">
                  <span className="text-midnight dark:text-canvas">{t.controls.thresholdLabel}</span>
                  <span className="font-mono text-emerald-700 dark:text-lime font-bold">
                    {thresholdDb} dB
                  </span>
                </div>
                <input
                  type="range"
                  min="-60"
                  max="-20"
                  step="1"
                  value={thresholdDb}
                  onChange={(e) => setThresholdDb(parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-200 dark:bg-midnight rounded-lg cursor-pointer"
                />
                <p className="text-[11px] text-navy/70 dark:text-canvas/60">
                  {t.controls.thresholdDesc}
                </p>
              </div>

              {/* Slider 2: Max Silence Duration */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs md:text-sm font-semibold">
                  <span className="text-midnight dark:text-canvas">{t.controls.maxSilenceLabel}</span>
                  <span className="font-mono text-emerald-700 dark:text-lime font-bold">
                    {maxSilenceDuration.toFixed(2)}s
                  </span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="2.5"
                  step="0.05"
                  value={maxSilenceDuration}
                  onChange={(e) => setMaxSilenceDuration(parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-200 dark:bg-midnight rounded-lg cursor-pointer"
                />
                <p className="text-[11px] text-navy/70 dark:text-canvas/60">
                  {t.controls.maxSilenceDesc}
                </p>
              </div>

              {/* Slider 3: Natural Padding */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs md:text-sm font-semibold">
                  <span className="text-midnight dark:text-canvas">{t.controls.paddingLabel}</span>
                  <span className="font-mono text-emerald-700 dark:text-lime font-bold">
                    {Math.round(naturalPadding * 1000)}ms
                  </span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="0.30"
                  step="0.01"
                  value={naturalPadding}
                  onChange={(e) => setNaturalPadding(parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-200 dark:bg-midnight rounded-lg cursor-pointer"
                />
                <p className="text-[11px] text-navy/70 dark:text-canvas/60">
                  {t.controls.paddingDesc}
                </p>
              </div>
            </div>

            {/* Column B: Pro Mastering & Voice Polish */}
            <div className="bg-white dark:bg-navy p-6 rounded-3xl border border-slate-200 dark:border-navy shadow-soft-card space-y-5">
              <div className="flex items-center gap-2.5">
                <Wand2 className="w-5 h-5 text-midnight dark:text-lime" />
                <h3 className="font-bold text-midnight dark:text-canvas text-base md:text-lg">
                  {t.mastering.sectionTitle}
                </h3>
              </div>

              {/* Toggle 1: Voice Polish */}
              <div
                onClick={() => setVoicePolish(!voicePolish)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 ${
                  voicePolish
                    ? 'border-lime bg-mint/20 dark:bg-midnight/60 shadow-sm'
                    : 'border-slate-200 dark:border-midnight/40 bg-canvas/50 dark:bg-midnight/20 opacity-80'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-md mt-0.5 flex items-center justify-center shrink-0 border ${
                    voicePolish
                      ? 'bg-lime border-lime text-midnight font-bold'
                      : 'border-slate-300 dark:border-slate-600'
                  }`}
                >
                  {voicePolish && <CheckCircle2 className="w-4 h-4 text-midnight" />}
                </div>
                <div>
                  <div className="font-bold text-sm text-midnight dark:text-canvas">
                    {t.mastering.voicePolishLabel}
                  </div>
                  <div className="text-xs text-navy/70 dark:text-canvas/60 mt-0.5">
                    {t.mastering.voicePolishDesc}
                  </div>
                </div>
              </div>

              {/* Toggle 2: Auto-Level Volume */}
              <div
                onClick={() => setAutoLevel(!autoLevel)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 ${
                  autoLevel
                    ? 'border-lime bg-mint/20 dark:bg-midnight/60 shadow-sm'
                    : 'border-slate-200 dark:border-midnight/40 bg-canvas/50 dark:bg-midnight/20 opacity-80'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-md mt-0.5 flex items-center justify-center shrink-0 border ${
                    autoLevel
                      ? 'bg-lime border-lime text-midnight font-bold'
                      : 'border-slate-300 dark:border-slate-600'
                  }`}
                >
                  {autoLevel && <CheckCircle2 className="w-4 h-4 text-midnight" />}
                </div>
                <div>
                  <div className="font-bold text-sm text-midnight dark:text-canvas">
                    {t.mastering.autoLevelLabel}
                  </div>
                  <div className="text-xs text-navy/70 dark:text-canvas/60 mt-0.5">
                    {t.mastering.autoLevelDesc}
                  </div>
                </div>
              </div>

              {/* Export Format Selector */}
              <div className="pt-2">
                <label className="text-xs font-semibold text-midnight dark:text-canvas block mb-2">
                  {t.export.formatLabel}
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setExportFormat('mp3')}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-colors ${
                      exportFormat === 'mp3'
                        ? 'bg-midnight text-canvas dark:bg-lime dark:text-midnight border-transparent'
                        : 'bg-canvas dark:bg-midnight text-navy dark:text-canvas border-slate-200 dark:border-midnight'
                    }`}
                  >
                    MP3 (192kbps)
                  </button>
                  <button
                    onClick={() => setExportFormat('wav')}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-colors ${
                      exportFormat === 'wav'
                        ? 'bg-midnight text-canvas dark:bg-lime dark:text-midnight border-transparent'
                        : 'bg-canvas dark:bg-midnight text-navy dark:text-canvas border-slate-200 dark:border-midnight'
                    }`}
                  >
                    WAV (16-bit Master)
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* EXPORT ACTION FOOTER */}
          <div className="bg-white dark:bg-navy p-6 rounded-3xl border border-lime/40 shadow-soft-card flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <div className="font-bold text-midnight dark:text-canvas text-base">
                Ready to Export Master
              </div>
              <div className="text-xs text-navy/70 dark:text-canvas/60">
                15ms micro-fades applied • Zero server wait times • Full privacy
              </div>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                disabled={isExporting}
                onClick={handleExport}
                className="w-full sm:w-auto bg-midnight hover:bg-midnight/90 dark:bg-lime dark:hover:bg-lime/90 text-canvas dark:text-midnight font-bold px-8 py-4 rounded-2xl shadow-lg transition-transform hover:scale-105 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm md:text-base"
              >
                {isExporting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-canvas dark:border-midnight border-t-transparent rounded-full animate-spin" />
                    <span>Rendering ({exportProgress}%)...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5" />
                    <span>{t.export.exportBtn}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Progress bar during export */}
          {isExporting && (
            <div className="w-full bg-slate-200 dark:bg-midnight rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-lime h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${exportProgress}%` }}
              />
            </div>
          )}

          {/* Export Success Notification */}
          {exportSuccess && (
            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-lime text-sm font-bold flex items-center justify-between animate-fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-lime" />
                <span>{t.export.exportDone}</span>
              </div>
              <button
                onClick={() => setExportSuccess(false)}
                className="text-xs underline hover:opacity-80"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Export Error Notification */}
          {exportError && (
            <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-sm font-semibold flex items-center justify-between animate-fade-in">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                <span>{exportError}</span>
              </div>
              <button
                onClick={() => setExportError(null)}
                className="text-xs underline hover:opacity-80"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
