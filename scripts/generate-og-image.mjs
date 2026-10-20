import sharp from 'sharp';
import fs from 'fs';

let dots = '';
for (let i = 0; i < 12; i++) {
  for (let j = 0; j < 7; j++) {
    dots += `<circle cx="${i * 100 + 50}" cy="${j * 90 + 45}" r="2" fill="#E0F8C7" />`;
  }
}

let waveformBars = '';
for (let i = 0; i < 68; i++) {
  const x = i * 14.5;
  const inCut1 = x >= 135 && x <= 255;
  const inCut2 = x >= 515 && x <= 655;
  const height = Math.sin(i * 0.35) * 35 + Math.cos(i * 0.15) * 20 + 8;
  const barH = Math.max(6, Math.abs(height));
  const color = (inCut1 || inCut2) ? '#EF4444' : (i < 38 ? '#B7D894' : '#64748B');
  const opacity = (inCut1 || inCut2) ? '0.5' : (i < 38 ? '1' : '0.6');
  waveformBars += `<rect x="${x}" y="${-barH / 2}" width="6" height="${barH}" rx="3" fill="${color}" opacity="${opacity}" />`;
}

const svg = `
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#181E29" />
      <stop offset="50%" stop-color="#202734" />
      <stop offset="100%" stop-color="#111620" />
    </linearGradient>
    <linearGradient id="cardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2D364A" />
      <stop offset="100%" stop-color="#1F2635" />
    </linearGradient>
    <linearGradient id="cutGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="rgba(239, 68, 68, 0.4)" />
      <stop offset="100%" stop-color="rgba(239, 68, 68, 0.15)" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bgGrad)" />

  <!-- Background Grid Dots -->
  <g opacity="0.12">
    ${dots}
  </g>

  <!-- Brand Pill -->
  <g transform="translate(80, 75)">
    <rect width="280" height="44" rx="22" fill="#202734" stroke="#B7D894" stroke-width="1.5" opacity="0.9" />
    <circle cx="24" cy="22" r="6" fill="#B7D894" />
    <text x="42" y="27" fill="#E0F8C7" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="700" letter-spacing="1.5">100% LOCAL &amp; PRIVATE</text>
  </g>

  <!-- Logo & Title -->
  <g transform="translate(80, 150)">
    <rect width="80" height="80" rx="22" fill="#B7D894" />
    <!-- Mic icon -->
    <path d="M40 22 C35.5 22 32 25.5 32 30 L32 42 C32 46.5 35.5 50 40 50 C44.5 50 48 46.5 48 42 L48 30 C48 25.5 44.5 22 40 22 Z M53 38 C53 45 47 50.5 40 50.5 C33 50.5 27 45 27 38 L23 38 C23 46.5 29.5 53.5 38 54.8 L38 60 L32 60 L32 64 L48 64 L48 60 L42 60 L42 54.8 C50.5 53.5 57 46.5 57 38 Z" fill="#202734" />
    
    <text x="105" y="58" fill="#FFFFFF" font-family="system-ui, -apple-system, sans-serif" font-size="64" font-weight="900" letter-spacing="-1">PodEditor</text>
    <text x="435" y="56" fill="#B7D894" font-family="system-ui, -apple-system, sans-serif" font-size="36" font-weight="800">.github.io</text>
  </g>

  <!-- Tagline -->
  <text x="80" y="285" fill="#FFFFFF" font-family="system-ui, -apple-system, sans-serif" font-size="38" font-weight="800" letter-spacing="-0.5">
    Free Zero-Server Podcast Editor &amp; Auto Silence Remover
  </text>
  <text x="80" y="325" fill="#94A3B8" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="500">
    Strip dead air, master voice clarity with one click, and export studio-ready audio directly in your browser.
  </text>

  <!-- Waveform Visualizer Mock Card -->
  <g transform="translate(80, 360)">
    <rect width="1040" height="155" rx="20" fill="url(#cardGrad)" stroke="#36415A" stroke-width="1.5" />

    <!-- Silence Cut Block 1 -->
    <rect x="160" y="15" width="120" height="125" rx="8" fill="url(#cutGrad)" stroke="#EF4444" stroke-width="1" stroke-opacity="0.6" />
    <text x="175" y="38" fill="#F87171" font-family="monospace" font-size="12" font-weight="bold">✂ -1.8s SILENCE</text>

    <!-- Silence Cut Block 2 -->
    <rect x="540" y="15" width="140" height="125" rx="8" fill="url(#cutGrad)" stroke="#EF4444" stroke-width="1" stroke-opacity="0.6" />
    <text x="555" y="38" fill="#F87171" font-family="monospace" font-size="12" font-weight="bold">✂ -2.1s SILENCE</text>

    <!-- Waveform Bars -->
    <g transform="translate(25, 78)">
      ${waveformBars}

      <!-- Playhead Line -->
      <line x1="545" y1="-55" x2="545" y2="55" stroke="#B7D894" stroke-width="3" filter="url(#glow)" />
      <circle cx="545" cy="-50" r="6" fill="#B7D894" />
    </g>
  </g>

  <!-- Bottom Badges / Trust Points -->
  <g transform="translate(80, 560)">
    <g transform="translate(0, 0)">
      <circle cx="12" cy="12" r="12" fill="#B7D894" opacity="0.2" />
      <text x="7" y="17" fill="#B7D894" font-family="system-ui" font-size="14" font-weight="bold">✓</text>
      <text x="32" y="17" fill="#CBD5E1" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="600">Sub-Second RMS Silence Scanner</text>
    </g>

    <g transform="translate(300, 0)">
      <circle cx="12" cy="12" r="12" fill="#B7D894" opacity="0.2" />
      <text x="7" y="17" fill="#B7D894" font-family="system-ui" font-size="14" font-weight="bold">✓</text>
      <text x="32" y="17" fill="#CBD5E1" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="600">15ms Anti-Click Cosine Fades</text>
    </g>

    <g transform="translate(570, 0)">
      <circle cx="12" cy="12" r="12" fill="#B7D894" opacity="0.2" />
      <text x="7" y="17" fill="#B7D894" font-family="system-ui" font-size="14" font-weight="bold">✓</text>
      <text x="32" y="17" fill="#CBD5E1" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="600">One-Click Vocal Polish</text>
    </g>

    <g transform="translate(800, 0)">
      <circle cx="12" cy="12" r="12" fill="#B7D894" opacity="0.2" />
      <text x="7" y="17" fill="#B7D894" font-family="system-ui" font-size="14" font-weight="bold">✓</text>
      <text x="32" y="17" fill="#CBD5E1" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="600">WAV &amp; MP3 Export (Zero Server)</text>
    </g>
  </g>
</svg>
`;

await sharp(Buffer.from(svg))
  .resize(1200, 630)
  .png({ quality: 95 })
  .toFile('public/og-image.png');

console.log('Successfully generated public/og-image.png (1200x630)');
