import type { APIRoute } from 'astro';
import { business } from '../config/business';

const PAGES = ['/', '/pieteikties', '/pieejamiba', '/privatuma-politika'];

export const GET: APIRoute = ({ site }) => {
  const base = site ?? new URL(business.siteUrl);
  const urls = PAGES.map((p) => `  <url><loc>${new URL(p, base).href}</loc></url>`).join('\n');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } },
  );
};
