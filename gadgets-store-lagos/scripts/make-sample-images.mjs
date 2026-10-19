// Creates simple placeholder pictures for the sample products in public/samples/.
// Run with: npm run samples
// Real product photos uploaded in the admin dashboard replace these.

import { mkdirSync, writeFileSync } from 'node:fs';
import { SAMPLE_PRODUCTS } from '../src/data/samples.ts';

const BANNER_SLUGS = ['iphone-16-pro-max', 'macbook-air-13-m4', 'galaxy-s25-ultra'];

const outDir = new URL('../public/samples/', import.meta.url);
mkdirSync(outDir, { recursive: true });

const palettes = [
  ['#1e293b', '#475569'], // graphite
  ['#1d4ed8', '#60a5fa'], // blue
  ['#7c3aed', '#c4b5fd'], // purple
  ['#0f766e', '#5eead4'], // teal
  ['#9a3412', '#fdba74'], // titanium / copper
  ['#334155', '#cbd5e1'], // silver
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function device(category, slug, [dark, light]) {
  const body = `url(#body)`;
  if (category === 'phones') {
    return `<rect x="128" y="52" width="144" height="286" rx="30" fill="${body}"/>
      <rect x="137" y="61" width="126" height="268" rx="23" fill="url(#screen)"/>
      <rect x="180" y="72" width="40" height="11" rx="5.5" fill="#0b1220"/>`;
  }
  if (category === 'laptops') {
    return `<rect x="78" y="88" width="244" height="164" rx="12" fill="${body}"/>
      <rect x="88" y="98" width="224" height="144" rx="5" fill="url(#screen)"/>
      <path d="M48 262h304l-16 22H64z" fill="${light}"/><rect x="170" y="262" width="60" height="6" rx="3" fill="${dark}" opacity=".5"/>`;
  }
  if (category === 'tablets') {
    return `<rect x="100" y="62" width="200" height="276" rx="24" fill="${body}"/>
      <rect x="110" y="72" width="180" height="256" rx="16" fill="url(#screen)"/>`;
  }
  if (category === 'wearables') {
    return `<rect x="165" y="40" width="70" height="90" rx="14" fill="${light}"/><rect x="165" y="270" width="70" height="90" rx="14" fill="${light}"/>
      <rect x="135" y="115" width="130" height="170" rx="40" fill="${body}"/>
      <rect x="146" y="126" width="108" height="148" rx="30" fill="url(#screen)"/>
      <rect x="266" y="170" width="10" height="34" rx="5" fill="${dark}"/>`;
  }
  if (category === 'audio') {
    if (slug.includes('jbl')) {
      return `<rect x="70" y="140" width="260" height="120" rx="60" fill="${body}"/>
        <circle cx="130" cy="200" r="34" fill="${dark}" opacity=".55"/><circle cx="270" cy="200" r="34" fill="${dark}" opacity=".55"/>
        <rect x="150" y="186" width="100" height="28" rx="14" fill="#fff" opacity=".9"/>`;
    }
    return `<rect x="120" y="130" width="160" height="150" rx="48" fill="#f8fafc" stroke="${light}" stroke-width="4"/>
      <path d="M120 190h160" stroke="${light}" stroke-width="3"/><circle cx="200" cy="230" r="5" fill="${dark}"/>
      <path d="M150 95c0-22 26-22 26 0v40h-26z" fill="#f8fafc" stroke="${light}" stroke-width="4"/>
      <path d="M224 95c0-22 26-22 26 0v40h-26z" fill="#f8fafc" stroke="${light}" stroke-width="4"/>`;
  }
  if (category === 'gaming') {
    if (slug.includes('ps5')) {
      return `<path d="M150 50c40 8 60 20 60 40v240c0 18-25 22-60 20z" fill="#f8fafc" stroke="#cbd5e1" stroke-width="4"/>
        <path d="M210 70h40v270h-40z" fill="${dark}"/><path d="M250 50c-15 6-40 12-40 40v250c10 0 40-2 40-10z" fill="#f8fafc" stroke="#cbd5e1" stroke-width="4"/>`;
    }
    return `<path d="M120 160h160a50 50 0 0 1 50 45l8 70a28 28 0 0 1-48 22l-30-30H140l-30 30a28 28 0 0 1-48-22l8-70a50 50 0 0 1 50-45z" fill="${body}"/>
      <circle cx="150" cy="205" r="16" fill="${dark}" opacity=".6"/><circle cx="255" cy="205" r="16" fill="${dark}" opacity=".6"/>`;
  }
  // accessories
  if (slug.includes('power-bank')) {
    return `<rect x="120" y="70" width="160" height="260" rx="24" fill="${body}"/>
      <rect x="185" y="100" width="30" height="8" rx="4" fill="#fff" opacity=".8"/>
      <circle cx="200" cy="290" r="6" fill="#22c55e"/>`;
  }
  if (slug.includes('cable')) {
    return `<circle cx="200" cy="200" r="95" fill="none" stroke="${dark}" stroke-width="14"/>
      <circle cx="200" cy="200" r="70" fill="none" stroke="${light}" stroke-width="14"/>
      <rect x="282" y="110" width="30" height="56" rx="8" fill="#e2e8f0" stroke="#94a3b8" stroke-width="3"/>`;
  }
  return `<rect x="135" y="120" width="130" height="150" rx="22" fill="#f8fafc" stroke="#cbd5e1" stroke-width="4"/>
    <rect x="182" y="185" width="36" height="12" rx="6" fill="#94a3b8"/>
    <rect x="160" y="270" width="16" height="50" rx="4" fill="#94a3b8"/><rect x="224" y="270" width="16" height="50" rx="4" fill="#94a3b8"/>`;
}

SAMPLE_PRODUCTS.forEach((p, i) => {
  const pal = palettes[i % palettes.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
  <defs>
    <linearGradient id="body" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${pal[1]}"/><stop offset="1" stop-color="${pal[0]}"/></linearGradient>
    <linearGradient id="screen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1220"/><stop offset=".55" stop-color="#1e3a8a"/><stop offset="1" stop-color="${pal[1]}"/></linearGradient>
    <radialGradient id="glow" cx=".5" cy=".45" r=".5"><stop offset="0" stop-color="${pal[1]}" stop-opacity=".35"/><stop offset="1" stop-color="${pal[1]}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="400" height="400" fill="#f5f7fa"/>
  <circle cx="200" cy="190" r="170" fill="url(#glow)"/>
  ${device(p.category, p.slug, pal)}
  <rect x="122" y="358" width="156" height="24" rx="12" fill="#fff" stroke="#e5e7eb"/>
  <text x="200" y="374" font-family="Arial,Helvetica,sans-serif" font-size="11" font-weight="700" fill="#5b6475" text-anchor="middle" letter-spacing="1.5">SAMPLE IMAGE</text>
  <title>${esc(p.name)}</title>
</svg>`;
  writeFileSync(new URL(`${p.slug}.svg`, outDir), svg.replace(/\n\s+/g, '\n'));

  // Background-free version for the homepage banners
  if (BANNER_SLUGS.includes(p.slug)) {
    const cutout = svg
      .replace(/<rect width="400" height="400"[^>]*\/>/, '')
      .replace(/<rect x="122" y="358"[\s\S]*?SAMPLE IMAGE<\/text>/, '');
    writeFileSync(new URL(`${p.slug}-cutout.svg`, outDir), cutout.replace(/\n\s+/g, '\n'));
  }
});

console.log(`Created ${SAMPLE_PRODUCTS.length} sample images in public/samples/`);
