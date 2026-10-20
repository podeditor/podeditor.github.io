import fs from 'fs';

const html = fs.readFileSync('dist/index.html', 'utf8');

const checks = [
  ['Canonical URL', html.includes('rel="canonical" href="https://podeditor.github.io/"')],
  ['Hreflang x-default', html.includes('hreflang="x-default"')],
  ['Hreflang 7 languages', ['en','es','pt','de','fr','ja','zh'].every(l => html.includes(`hreflang="${l}"`))],
  ['og:image (1200x630 metadata)', html.includes('og:image') && html.includes('1200') && html.includes('630')],
  ['og:image.png file exists on disk', fs.existsSync('public/og-image.png') && fs.statSync('public/og-image.png').size > 10000],
  ['Twitter Card summary_large_image', html.includes('summary_large_image')],
  ['Robots index, follow', html.includes('name="robots" content="index, follow')],
  ['Googlebot max-image-preview', html.includes('max-image-preview:large')],
  ['WebApplication Schema', html.includes('"@type":"WebApplication"')],
  ['AggregateRating Schema', html.includes('"@type":"AggregateRating"')],
  ['HowTo Schema', html.includes('"@type":"HowTo"')],
  ['FAQPage Schema', html.includes('"@type":"FAQPage"')],
  ['BreadcrumbList Schema', html.includes('"@type":"BreadcrumbList"')],
  ['Google Tag gtag.js', html.includes('G-FMSF11R1PG')],
  ['Breadcrumb visible nav', html.includes('aria-label="Breadcrumb"')],
  ['Dropzone Accessible Labels', html.includes('aria-label="Browse Audio File"') && html.includes('aria-label="Try Interactive Sample Podcast"')],
  ['Waveform canvas role and label (in code)', fs.readFileSync('src/components/PodcastStudio.tsx', 'utf8').includes('role="img"') && fs.readFileSync('src/components/PodcastStudio.tsx', 'utf8').includes('Interactive Audio Waveform Visualizer')],
];

console.table(checks.map(([name, pass]) => ({ Check: name, Status: pass ? 'PERFECT PASS' : 'FAIL' })));
const allPassed = checks.every(([_, pass]) => pass);
console.log('ALL AUDIT CHECKS PASSED:', allPassed);
