import lamejs from 'lamejs';

/**
 * Encode an AudioBuffer to an uncompressed 16-bit PCM WAV Blob.
 */
export function encodeWav(audioBuffer: AudioBuffer): Blob {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const format = 1; // 1 = PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const numSamples = audioBuffer.length;
  const dataSize = numSamples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // Helper to write ASCII strings
  function writeString(offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  // RIFF Chunk Descriptor
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');

  // "fmt " Sub-chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, format, true); // AudioFormat
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  // "data" Sub-chunk
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Interleave and write 16-bit PCM samples
  const channelData: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channelData.push(audioBuffer.getChannelData(ch));
  }

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      // Clamp float sample [-1.0, 1.0] to 16-bit signed int [-32768, 32767]
      let sample = channelData[ch][i];
      sample = Math.max(-1, Math.min(1, sample));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Encode an AudioBuffer to MP3 Blob using client-side lamejs.
 * Operates in time-sliced batches to keep UI responsive and report progress.
 */
export async function encodeMp3(
  audioBuffer: AudioBuffer,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      const channels = audioBuffer.numberOfChannels;
      const sampleRate = audioBuffer.sampleRate;
      const kbps = 192;

      // Extract lamejs Mp3Encoder
      const Mp3Encoder = (lamejs as any).Mp3Encoder || (lamejs as any).default?.Mp3Encoder;
      if (!Mp3Encoder) {
        throw new Error('Mp3Encoder could not be loaded from lamejs');
      }

      const encoder = new Mp3Encoder(channels, sampleRate, kbps);
      const mp3Data: Int8Array[] = [];

      // Convert Float32Array to Int16Array
      const sampleCount = audioBuffer.length;
      const leftFloat = audioBuffer.getChannelData(0);
      const rightFloat = channels > 1 ? audioBuffer.getChannelData(1) : leftFloat;

      const leftInt16 = new Int16Array(sampleCount);
      const rightInt16 = new Int16Array(sampleCount);

      for (let i = 0; i < sampleCount; i++) {
        const sL = Math.max(-1, Math.min(1, leftFloat[i]));
        leftInt16[i] = sL < 0 ? sL * 0x8000 : sL * 0x7fff;

        const sR = Math.max(-1, Math.min(1, rightFloat[i]));
        rightInt16[i] = sR < 0 ? sR * 0x8000 : sR * 0x7fff;
      }

      const chunkSize = 1152 * 8; // Multiple of MP3 frame size (1152)
      let offset = 0;

      function processChunk() {
        try {
          const end = Math.min(offset + chunkSize, sampleCount);
          const chunkL = leftInt16.subarray(offset, end);
          const chunkR = rightInt16.subarray(offset, end);

          let mp3buf: Int8Array;
          if (channels === 1) {
            mp3buf = encoder.encodeBuffer(chunkL);
          } else {
            mp3buf = encoder.encodeBuffer(chunkL, chunkR);
          }

          if (mp3buf.length > 0) {
            mp3Data.push(mp3buf);
          }

          offset = end;
          const progress = Math.min(98, Math.round((offset / sampleCount) * 100));
          if (onProgress) {
            onProgress(progress);
          }

          if (offset < sampleCount) {
            // Yield to main loop
            setTimeout(processChunk, 0);
          } else {
            // Flush remaining data
            const finalBuf = encoder.flush();
            if (finalBuf.length > 0) {
              mp3Data.push(finalBuf);
            }
            if (onProgress) onProgress(100);

            const blob = new Blob(mp3Data, { type: 'audio/mp3' });
            resolve(blob);
          }
        } catch (err) {
          reject(err);
        }
      }

      processChunk();
    } catch (err) {
      reject(err);
    }
  });
}
