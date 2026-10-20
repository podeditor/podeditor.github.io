# PodEditor | Free Zero-Server Podcast Editor & Auto Silence Remover

> **100% Client-Side Web Audio Studio** • Zero Server Uploads • Total Privacy • High-Pass Filter & Vocal Polish • WAV & MP3 Export

Official website: **[https://podeditor.github.io](https://podeditor.github.io)**  
Developer Support: **[https://ko-fi.com/kishara](https://ko-fi.com/kishara)**

---

## 🎙️ Overview

**PodEditor** is an ultra-minimal, high-performance, 100% client-side web podcast editor built with **Astro (SSG)** and **React (Islands Architecture)**. It enables podcast creators, interviewers, voiceover artists, and educators to load large local recordings (MP3, WAV, M4A, AAC, OGG) of any length, automatically detect and strip dead air, apply professional one-click vocal mastering, and export broadcast-ready audio directly in the browser.

Your raw audio files **never touch an external server or cloud API**. All DSP (Digital Signal Processing) runs directly in-memory via the HTML5 Web Audio API and WebAssembly.

---

## ✨ Key Features

- **🚀 Sub-Second RMS Silence Detection Engine**:
  - **Silence Threshold (`-60dB` to `-20dB`)**: Accurately differentiates between subtle room tone and awkward dead air.
  - **Max Silence Duration (`0.2s` to `2.5s`)**: Trims excessive pauses while preserving natural comedic and conversational rhythm.
  - **Natural Padding & 15ms Micro-Crossfades**: Protects word attacks, breaths, and eliminates digital pops/clicks.
- **🎨 Interactive Waveform Canvas**:
  - Renders voice regions in Fresh Sage Lime (`#B7D894`) and silent gaps in transparent red/gray.
  - **Click-to-Toggle**: Click any highlighted silence block directly on the waveform to toggle between **Cut** and **Keep**.
  - Non-destructive scrubbing with zoom controls (`1x` to `4x`).
- **🎧 Live "Skip Silences" Audition Preview**:
  - Audition your edits in real-time before exporting. When enabled, playback automatically leaps over trimmed silences with zero latency.
  - Playback speed toggles: `1.0x`, `1.25x`, `1.5x`, `2.0x`.
- **🎛️ Pro Podcast Vocal Mastering**:
  - **Podcast Voice Polish**: 80Hz rumble cut (eliminates desk thumps & HVAC hum) + 3kHz vocal presence boost + gentle leveling compressor.
  - **Auto-Level Volume**: Automatically evens out soft whispers and loud laughs to standard broadcast loudness (-1 dBFS peak).
- **⚡ Blazing Fast Client-Side Export**:
  - Rendered via `OfflineAudioContext` at 15x–30x real-time speed.
  - **WAV**: Lossless 16-bit uncompressed studio master.
  - **MP3**: Broadcast-quality 192kbps encoded via chunked `lamejs`.
- **🌍 7-Language Internationalization (i18n)**:
  - English (`en`, US)
  - Español (`es`, ES)
  - Português (`pt`, BR)
  - Deutsch (`de`, DE)
  - Français (`fr`, FR)
  - 日本語 (`ja`, JP)
  - 简体中文 (`zh`, CN)
- **🌓 Seamless Theme Engine**:
  - Clean Light mode (`#F9FCF6` canvas) and Deep Midnight Dark mode (`#202734`).
  - Mobile-responsive navbar strictly collapsing to icon-only mode on tablet and mobile screens.

---

## 🎨 Design System Palette

| Token Name | Hex Code | Purpose |
|---|---|---|
| `deep_midnight_slate` | `#202734` | Dark mode studio canvas, high-contrast typography, primary buttons |
| `muted_steel_navy` | `#36415A` | Secondary panels, control cards, unplayed waveform peaks |
| `fresh_sage_lime` | `#B7D894` | Active audio waveforms, detected speech regions, primary accents |
| `soft_mint_cream` | `#E0F8C7` | Elevated cards, pill badges, subtle active highlights |
| `light_canvas_bg` | `#F9FCF6` | Default light studio background |

---

## 🛠️ Architecture & Tech Stack

```
podeditor.github.io/
├── .github/workflows/deploy.yml   # Automatic GitHub Pages CI/CD workflow
├── astro.config.mjs               # Astro SSG + i18n subpath configuration
├── tailwind.config.mjs            # Hex palette theme configuration
├── package.json                   # Dependencies (Astro, React, lamejs, Tailwind)
├── src/
│   ├── components/
│   │   ├── Navbar.astro           # Responsive navbar with 7-language selector & theme toggle
│   │   ├── Footer.astro           # Footer with language sitemap and Ko-fi badge
│   │   ├── MainPage.astro         # Reusable localized studio & SEO section container
│   │   └── PodcastStudio.tsx      # React Island: Waveform Canvas, DSP, and Transport
│   ├── i18n/
│   │   ├── ui.ts                  # Language constants and translation helpers
│   │   └── locales/               # 7 JSON dictionaries (en, es, pt, de, fr, ja, zh)
│   ├── layouts/
│   │   └── Layout.astro           # SEO layout with WebApplication, HowTo, FAQ JSON-LD schemas
│   ├── pages/
│   │   ├── index.astro            # Default root English route (/)
│   │   ├── es/index.astro         # Spanish route (/es)
│   │   ├── pt/index.astro         # Portuguese route (/pt)
│   │   ├── de/index.astro         # German route (/de)
│   │   ├── fr/index.astro         # French route (/fr)
│   │   ├── ja/index.astro         # Japanese route (/ja)
│   │   └── zh/index.astro         # Chinese route (/zh)
│   ├── styles/
│   │   └── global.css             # Tailwind base and theme variables
│   └── utils/
│       ├── audioEncoder.ts        # Pure client-side 16-bit WAV and MP3 (lamejs) encoders
│       └── PodcastProcessor.ts    # Web Audio DSP, RMS scanner, cosine micro-crossfades
└── public/
    ├── robots.txt                 # Search engine crawler permissions
    └── sitemap.xml                # Multi-language XML sitemap
```

---

## 💻 Local Development

```bash
# 1. Install dependencies
npm install

# 2. Start local development server
npm run dev

# 3. Build static production site for GitHub Pages
npm run build

# 4. Preview the built static production site
npm run preview
```

---

## ☕ Support the Developer

If PodEditor saves you hours of tedious audio editing, consider supporting ongoing development:

👉 **[Support on Ko-fi](https://ko-fi.com/kishara)**

---

## 📄 License

MIT License. Free for personal and commercial podcast production.
