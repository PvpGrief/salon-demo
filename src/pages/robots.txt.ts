import type { APIRoute } from 'astro';
import { business } from '../config/business';

export const GET: APIRoute = ({ site }) => {
  const base = site ?? new URL(business.siteUrl);
  return new Response(
    `User-agent: *\nDisallow: /admin\nDisallow: /atcelt/\nDisallow: /api/\n\nSitemap: ${new URL('/sitemap.xml', base).href}\n`,
    { headers: { 'content-type': 'text/plain; charset=utf-8' } },
  );
};
