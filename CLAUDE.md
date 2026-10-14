# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

A reusable **booking website template** for small beauty salons and service
businesses in **Latvia**. Each client gets their own copy of the site and their
own Supabase project (single business, no multi-tenancy). Stack: Astro 7
(server output) + React islands + Tailwind CSS v4 + Supabase (Postgres, Auth,
Storage). The default host is Cloudflare Workers; Netlify and Node also work
(`DEPLOY_TARGET`).

## Hard rules

1. **All visitor-facing and admin text is Latvian (lv)**, with correct diacritics (ā č ē ģ ī ķ ļ ņ š ū ž). Code comments and docs are English.
2. **Time zone is always Europe/Riga.** Store instants as `timestamptz` (UTC). Show dates as `dd.mm.yyyy` and times as 24h `HH:mm`. Use the helpers in `src/lib/time.ts`; never format dates by hand and never use the server's local time.
3. **Do not change the booking / availability logic unless the user explicitly asks.** Protected files:
   - `src/lib/booking/slots.ts`, `src/lib/booking/availability.ts`
   - `supabase/migrations/*` (add a **new** migration file instead of editing old ones)
   - `src/actions/public.ts` (`createBooking`, `cancelBooking`)
   - `src/pages/api/slots.ts`, `src/pages/admin/api/slots.ts`

   If a change is requested there, keep the TypeScript rules (`slots.ts`) and the SQL rules (`fits_schedule()` / `create_booking()`) identical, then run both `npm test` and `npm run test:db`.
4. **Client-specific content goes in `src/config/business.ts`** (or the database via `/admin`), never hard-coded in components.
5. **Security:**
   - Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser; it is only used server-side in `src/lib/supabase.ts → serviceClient()`.
   - Never loosen RLS.
   - Never add public sign-up.
   - Customer data must never appear on public pages.
6. Do not commit `.env`, keys or real customer data.

## Where things live

| What | Where |
|---|---|
| Business name, contacts, opening hours (display), colors, hero/section texts, gallery, reviews, SEO, privacy-policy details, e-mail sender | `src/config/business.ts` |
| Generic UI texts (buttons, labels, errors) | `src/config/texts.ts` |
| Services, prices, masters, master photos, working hours, closed days, blocks, booking rules | Database, edited in `/admin` |
| Demo data | `supabase/seed.sql` |
| Images (logo, hero, masters, gallery, OG image) | `public/images/`; regenerate the OG image with `npm run og-image` |
| Fonts | `src/styles/global.css` (self-hosted `@fontsource`; no Google Fonts for GDPR reasons) |
| Brand color variables | injected from `business.theme` in `src/layouts/Base.astro` and `src/layouts/Admin.astro` |

## Project map

```
src/pages/index.astro              homepage (sections from src/components/sections/*)
src/pages/pieteikties.astro        booking page → components/booking/BookingWizard.tsx
src/pages/pieejamiba.astro         public free/busy view (no personal data)
src/pages/atcelt/[token].astro     customer self-cancel
src/pages/privatuma-politika.astro privacy policy template
src/pages/admin/*                  admin panel (protected by src/middleware.ts)
src/actions/public.ts              createBooking, cancelBooking
src/actions/admin.ts               all admin mutations (each checks admin + RLS)
src/lib/booking/slots.ts           pure slot calculation  ⚠ protected
src/lib/time.ts                    Riga time helpers
src/lib/email.ts                   e-mails (optional; skipped if no provider key)
src/lib/email-providers.ts         Resend / Brevo selection + request format (EMAIL_PROVIDER)
supabase/migrations/               schema, functions, RLS, storage  ⚠ add new files only
```

## Commands

```bash
npm install
npx supabase start        # local Supabase in Docker (ports 54321–54324)
npm run db:reset          # re-apply migrations + seed (wipes local data)
npm run create-admin -- admin@example.lv "Demo-Parole-2026"
npm run dev               # http://localhost:4321  (admin: /admin)
npm test                  # unit tests (no DB)
npm run test:db           # DB tests (needs `npx supabase start`)
npm run check             # astro check (types)
npm run build             # production build (Cloudflare by default)
```

`.env` holds `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
and optionally `EMAIL_PROVIDER` (`resend` | `brevo`) with `RESEND_API_KEY` or
`BREVO_API_KEY`. Get the local Supabase values from `npx supabase status`.

## Conventions and gotchas

- **Astro 7.** `compressHTML: true` is set in `astro.config.mjs` so templates keep normal HTML whitespace rules.
- **Cloudflare deploy:** `npm run build` generates `dist/server/wrangler.json` (entry point plus `dist/client` assets), and `wrangler deploy` uses it through `.wrangler/deploy/config.json`. Keep `wrangler.jsonc` minimal: no `main` and no `assets`. Its `name` must match the Worker name in the dashboard.
- **Secrets** are read with `astro:env/server`, which works on every adapter. Do not use `Astro.locals.runtime`; it was removed in Astro 6+.
- **Forms in `/admin`** are plain HTML forms posting to Astro Actions (`action={actions.admin.x}`). The page reads `Astro.getActionResult()` and redirects with `?ok=<key>`. The flash texts are in `src/layouts/Admin.astro`. Keep the forms working without JavaScript where possible.
- **Tailwind v4.** Reusable classes (`btn-primary`, `card`, `input`, `label`, `section-title`, …) are defined with `@utility` in `src/styles/global.css`. Use the theme colors `brand`, `accent`, `ink`, `muted`, `line`, `bg`, `surface`; do not hard-code hex colors in components.
- **Admin time inputs** use `components/admin/TimeSelect.astro` (24h `<select>`), because native `type="time"` can show AM/PM.
- **Customer contact:** online bookings require an **e-mail** (no phone field). Admin bookings need an e-mail or a phone (`bookings_contact_required`). The "max active bookings" limit counts per e-mail; the settings column is still named `max_active_per_phone`.
- **E-mail:** `EMAIL_PROVIDER` picks Resend or Brevo (`src/lib/email-providers.ts`). No key means nothing is sent, and a failed send is only logged. Sending must never break a booking. To add a provider, add a request builder there plus a unit test in `tests/unit/email-providers.test.ts`.
- **Database errors** from booking functions are short codes (`slot_unavailable`, `too_soon`, …), mapped to Latvian in `src/config/texts.ts → errors`.
- **New database objects** need explicit `grant`s and RLS policies in a new migration. Default privileges for API roles are revoked.

## Typical tasks

- **"Set up this template for client X"**: follow `NEW_CLIENT_CHECKLIST.md`. Edit `business.ts`, replace the images, run `npm run og-image`, and change the Worker name in `wrangler.jsonc`. Do not touch the booking logic.
- **Add or change a homepage section**: create or edit a component in `src/components/sections/`, put its texts in `business.ts`, and add it to `src/pages/index.astro`.
- **Change colors or fonts**: `business.theme` or `src/styles/global.css`.
- **Before finishing:** `npm test`, `npm run check`, `npm run build`. If anything booking-related changed, also run `npm run test:db`.
