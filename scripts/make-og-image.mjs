/**
 * Generates public/images/og-image.png (1200×630) from the logo and business
 * name. Run after changing src/config/business.ts:  node scripts/make-og-image.mjs
 * (or simply replace the PNG with your own design).
 */
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';

const cfg = await readFile(new URL('../src/config/business.ts', import.meta.url), 'utf8');
const pick = (re, fallback) => cfg.match(re)?.[1] ?? fallback;
const name = pick(/name:\s*'([^']+)'/, 'Salons');
const tagline = pick(/title:\s*'([^']+)'/, '');
const primary = pick(/primary:\s*'([^']+)'/, '#8a4b5c');
const accent = pick(/accent:\s*'([^']+)'/, '#c59d5f');
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="1200" height="630" fill="${primary}"/>
  <circle cx="1080" cy="80" r="220" fill="#fff" opacity=".07"/>
  <circle cx="120" cy="600" r="180" fill="#fff" opacity=".06"/>
  <rect x="80" y="250" width="90" height="6" fill="${accent}"/>
  <text x="80" y="220" font-family="Georgia, serif" font-size="64" fill="#fff">${esc(name)}</text>
  <text x="80" y="330" font-family="Arial, sans-serif" font-size="40" fill="#fff" opacity=".9">${esc(tagline)}</text>
  <text x="80" y="540" font-family="Arial, sans-serif" font-size="30" fill="#fff" opacity=".8">Pieraksts tiešsaistē 24/7</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(new URL('../public/images/og-image.png', import.meta.url).pathname);
console.log('public/images/og-image.png updated');
