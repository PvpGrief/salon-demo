# Salon booking website template (Latvia)

A fast, mobile-first website with online booking for small beauty salons and
other appointment-based businesses in Latvia. Visitor-facing text and the
admin panel are in Latvian, and all times use Europe/Riga.

**Stack:** [Astro 7](https://astro.build) (server-rendered, with small React
islands) + [Supabase](https://supabase.com) (Postgres, Auth, Storage) +
Tailwind CSS. It deploys to **Cloudflare Workers** by default, or to
**Netlify**; both free tiers allow commercial use.

Why this stack:
- The public pages ship almost no JavaScript, so they load fast and are easy for search engines.
- Supabase's free tier, EU (Frankfurt) region and Row Level Security cover what the site needs.
- Hosting costs nothing until the site gets serious traffic.

---

## Contents

1. [Features](#features)
2. [Project structure](#project-structure)
3. [Run it locally](#run-it-locally)
4. [Environment variables](#environment-variables)
5. [Set up the production Supabase project](#set-up-the-production-supabase-project)
6. [Create the admin account](#create-the-admin-account)
7. [Deploy to Cloudflare (default)](#deploy-to-cloudflare-default)
8. [Deploy to Netlify (alternative)](#deploy-to-netlify-alternative)
9. [E-mail with Resend or Brevo (optional)](#e-mail-with-resend-or-brevo-optional)
10. [Customize for a new client](#customize-for-a-new-client)
11. [Tests](#tests)
12. [How booking safety works](#how-booking-safety-works)
13. [Privacy / GDPR notes](#privacy--gdpr-notes)
14. [Operations and troubleshooting](#operations-and-troubleshooting)

---

## Features

**Public website** (`/`)
- One page with these sections: hero, services and prices, masters, gallery, reviews, and contact details with opening hours and a map (OpenStreetMap, so no cookies).
- SEO: title, description, canonical URL, Open Graph tags, schema.org `LocalBusiness` JSON-LD, `sitemap.xml` and `robots.txt`.
- Accessible: semantic HTML, keyboard focus styles, a skip link and reduced-motion support.
- An informational data notice (the site uses only strictly necessary cookies) and a Latvian privacy-policy template (`/privatuma-politika`).

**Booking** (`/pieteikties`)
- The customer picks a service, then a master or "Jebkurš brīvais meistars" (any free master), then a date and time, and then enters a name and **e-mail** (required; no phone number is asked).
- Free slots are calculated from each master's working hours, the service duration, existing bookings, master blocks, closed days and the booking rules (slot step, buffer, minimum notice, how far ahead).
- Double booking is impossible: the database refuses overlapping bookings even when two requests arrive at the same moment.
- A confirmation screen with "add to calendar" (Google Calendar and `.ics`).
- The confirmation screen shows a cancel link (`/atcelt/<token>`). With an e-mail provider set up (Resend or Brevo), the customer also gets a confirmation e-mail with the cancel link, and the owner gets a copy.
- A public free/busy view (`/pieejamiba`) shows which masters are free or busy and when, without any customer data.

**Admin panel** (`/admin`, password protected, works well on phones)
- Bookings by day or week, filtered by master, with customer details and tap-to-call.
- Create (e.g. phone bookings, where an e-mail or a phone number is enough), edit, reschedule, cancel, restore and delete bookings, with suggested free times.
- Block the whole salon for days (holidays) or one master for days or time ranges (vacation, sick day, lunch).
- Manage masters (photo upload, services offered, weekly working hours with a break) and services (duration, price, "no …" ("from …") prices, categories).
- Booking rules, password change, and GDPR clean-up of old customer data.

---

## Project structure

```
src/
  config/business.ts      ← ALL client content: name, contacts, hours, colors, texts, gallery, reviews, SEO, legal
  config/texts.ts         ← generic Latvian UI texts (buttons, labels, error messages)
  pages/                  ← routes: index, pieteikties, pieejamiba, privatuma-politika, atcelt/[token], admin/*
  components/sections/    ← homepage sections (Hero, Services, Masters, Gallery, Reviews, Contact)
  components/booking/     ← BookingWizard.tsx (React island)
  components/admin/       ← admin form pieces
  actions/                ← server actions: public booking/cancel, admin CRUD
  lib/booking/slots.ts    ← ⚠ slot calculation (pure functions, unit-tested)
  lib/booking/availability.ts ← loads data for the slot calculation
  lib/time.ts             ← Europe/Riga helpers, dd.mm.yyyy / 24h formatting
  lib/email.ts            ← optional e-mails (provider in lib/email-providers.ts: Resend or Brevo)
  middleware.ts           ← protects /admin, security headers
supabase/
  migrations/             ← database schema, booking functions, RLS, storage
  seed.sql                ← demo data (3 masters, 5 services, bookings around today)
  config.toml             ← local Supabase settings
public/images/            ← logo, hero, master photos, gallery, og-image.png (replace per client)
scripts/create-admin.mjs  ← creates the admin user
tests/unit/               ← slot/time/format unit tests (no database needed)
tests/db/                 ← database tests: RLS, double booking under concurrency, TS↔DB parity
```

---

## Run it locally

**You need:** Node.js 22.12 or newer, and Docker (for the local Supabase).

```bash
npm install
npx supabase start          # first run downloads the Docker images (a few minutes)
cp .env.example .env        # then paste the local keys, see below
npm run db:reset            # applies migrations + demo seed
npm run create-admin -- admin@example.lv "Demo-Parole-2026"
npm run dev                 # http://localhost:4321
```

`npx supabase start` (or `npx supabase status`) prints the local values to put in `.env`:

| `.env` variable | value from `supabase status` |
|---|---|
| `SUPABASE_URL` | `API_URL` (http://127.0.0.1:54321) |
| `SUPABASE_ANON_KEY` | `ANON_KEY` |
| `SUPABASE_SERVICE_ROLE_KEY` | `SERVICE_ROLE_KEY` |

- Website: http://localhost:4321
- Admin: http://localhost:4321/admin (log in as `admin@example.lv` / `Demo-Parole-2026`)
- Local database UI (Supabase Studio): http://127.0.0.1:54323
- E-mails sent by Supabase Auth locally: http://127.0.0.1:54324

The dev server runs in Cloudflare's `workerd` runtime and reads `.env`. If you
prefer plain Node.js: `DEPLOY_TARGET=node npm run dev`.

`npm run db:reset` wipes the local database back to the demo seed. Run
`create-admin` again afterwards.

---

## Environment variables

| Name | Required | Where to find it | Notes |
|---|---|---|---|
| `SUPABASE_URL` | yes | Supabase → Project Settings → Data API → Project URL | |
| `SUPABASE_ANON_KEY` | yes | Supabase → Project Settings → API Keys → `anon` (legacy) or the **publishable** key | Safe for public data; RLS applies. |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Same page → `service_role` (legacy) or a **secret** key | **Server only, never share it.** Used only to create bookings and for the cancel link. |
| `EMAIL_PROVIDER` | no | | `resend` or `brevo`. Empty = whichever key below is set (Resend first). |
| `RESEND_API_KEY` | no | Resend → API Keys | Recommended e-mail provider. |
| `BREVO_API_KEY` | no | Brevo → SMTP & API → API Keys | Alternative provider. Without any key, e-mails are off. |
| `SITE_URL` | no | | Overrides `business.siteUrl` for canonical/OG URLs. |
| `DEPLOY_TARGET` | no | | `cloudflare` (default), `netlify` or `node`. |

`.env` is git-ignored. `.env.example` lists every variable.

---

## Set up the production Supabase project

1. Create a project at [supabase.com](https://supabase.com). Region: **EU Central (Frankfurt)**. Save the database password.
2. **Authentication → Sign In / Providers**:
   - Keep the **Email** provider **enabled**; the admin logs in with e-mail and password.
   - Turn **off "Allow new users to sign up"**, so there is no public registration.
3. Apply the database schema from your computer:
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>   # ref = the xxxx in https://xxxx.supabase.co
   npm run db:push                                       # applies supabase/migrations/*
   ```
   Alternative without the CLI: open **SQL Editor** and run each file in `supabase/migrations/` in name order.
4. **Demo data (only for a demo site!):** `npx supabase db push --include-seed`, or paste `supabase/seed.sql` into the SQL Editor. For a real client, skip this and add services and masters in `/admin`.
5. Copy the URL and keys into `.env` (for scripts) and into your hosting environment (see below).

The migrations create:
- all tables with RLS;
- the overlap constraint that prevents double booking;
- the booking functions;
- the `media` storage bucket for master photos.

---

## Create the admin account

There is no sign-up page. Run the script with the target project's keys in `.env`:

```bash
npm run create-admin -- owner@salons.lv              # generates and prints a strong password
npm run create-admin -- owner@salons.lv "Own-Password-123"
```

Running it again for the same e-mail resets the password. The owner can change
the password later in **/admin → Iestatījumi**. To add a second admin, run the
script with another e-mail.

---

## Deploy to Cloudflare (default)

The site runs as a Cloudflare **Worker** with static assets (not a Pages
project). The free plan includes 100,000 requests per day and allows
commercial use.

**How it works:**
- `npm run build` creates `dist/client` (static files) and `dist/server` (the Worker). It also writes the real deploy config to `dist/server/wrangler.json`, plus a redirect in `.wrangler/deploy/config.json`.
- `npx wrangler deploy` then follows that redirect automatically.
- `wrangler.jsonc` only holds the Worker name and runtime flags. **Always build before deploying.**

**Option A – Workers Builds (connect the Git repository, auto-deploys on push)**

1. Make sure the branch you deploy contains the code. Workers Builds deploys **`main`** by default.
2. Cloudflare dashboard → **Workers & Pages → Create → Import a repository**, and pick this repo. For an existing Worker: **Settings → Build → Connect**.
3. Use exactly these build settings:

   | Setting | Value |
   |---|---|
   | Production branch | `main` (or whichever branch holds the code) |
   | Build command | `npm run build` |
   | Deploy command | `npx wrangler deploy` |
   | Non-production branch deploy command | `npx wrangler versions upload` (default) |
   | Root directory / path | *(empty – repository root)* |
   | Build variables | none needed; `.node-version` pins Node 22 |

4. The Worker name in the dashboard **must equal `"name"` in `wrangler.jsonc`** (currently `salon-demo`). Either name the Worker the same, or change `"name"` in `wrangler.jsonc` to your Worker's name and push.
5. **Settings → Variables and Secrets** (runtime, not "Build variables"): add `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and optionally `EMAIL_PROVIDER` + `RESEND_API_KEY` (or `BREVO_API_KEY`), all with type **Secret**. Then **Deployments → Retry/redeploy** (or push a commit).
   - The build itself needs no secrets; they are read at runtime.
   - `keep_vars` in `wrangler.jsonc` stops deploys from removing variables you added in the dashboard.
6. **Settings → Domains & Routes → Add → Custom domain** (e.g. `www.salons.lv`).

**Option B – deploy from your computer**
```bash
npx wrangler login
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put EMAIL_PROVIDER     # optional: resend | brevo
npx wrangler secret put RESEND_API_KEY     # optional (or BREVO_API_KEY)
npm run deploy                             # = astro build && wrangler deploy
```

Per client, change `"name"` in `wrangler.jsonc` (the Worker name) and
`siteUrl` in `src/config/business.ts`.

**Common deploy errors**

| Error in the build log | Cause and fix |
|---|---|
| `Could not detect a directory containing static files` | Wrangler found no `wrangler.jsonc`. The deployed branch has no code (e.g. `main` is still empty), or the root directory is wrong. Point the production branch at the branch with the code, or merge it into `main`. |
| `Missing entry-point to Worker script or to assets directory` | The deploy ran without a build. Set the build command to `npm run build`. |
| Name mismatch between Worker and config | Make the dashboard Worker name and `"name"` in `wrangler.jsonc` identical. |
| **500** on every page (older versions) or the page **"Vietne vēl nav pilnībā konfigurēta"** | The Worker does not receive the Supabase secrets. The page lists which ones. Add them under **Settings → Variables and Secrets** (not "Build variables"), with exactly these names, type Secret, then redeploy. |
| Site loads but services/masters are empty | Wrong key or URL, or no data yet. Check the Worker logs (**Observability → Logs**), and check that the migrations ran and data exists. |

---

## Deploy to Netlify (alternative)

`netlify.toml` is included and sets `DEPLOY_TARGET=netlify`.
1. Netlify → **Add new site → Import an existing project**, and pick the repo. The build settings are read from `netlify.toml`.
2. **Site configuration → Environment variables**: add the variables from the table above.
3. Add your domain under **Domain management**.
4. In `src/config/business.ts → legal.processors`, replace "Cloudflare, Inc." with "Netlify, Inc.".

---

## E-mail with Resend or Brevo (optional)

Customers book with their **e-mail** (required). The confirmation e-mail
contains the cancel link. Without an e-mail provider nothing is sent, the site
works normally, and the confirmation screen still shows the cancel link.

Choose the provider with one environment variable:

| `EMAIL_PROVIDER` | Key | Notes |
|---|---|---|
| `resend` (recommended) | `RESEND_API_KEY` | Free tier: 3,000 e-mails/month (100/day). Works from Cloudflare Workers. |
| `brevo` | `BREVO_API_KEY` | Free tier: about 300 e-mails/day. Brevo can block API calls from unknown IPs, and Cloudflare Workers have no fixed IP, so you must switch that blocking off. |
| *(empty)* | whichever is set | Resend if `RESEND_API_KEY` is set, otherwise Brevo. |

If the chosen provider has no key (or the name is wrong), e-mails are skipped
and **/admin → Iestatījumi** shows the reason.

**Resend setup**
1. Create an account at [resend.com](https://resend.com).
2. **Domains → Add domain** (e.g. `salons.lv`, region EU if offered). Add the DNS records it shows (SPF/DKIM) at the domain's DNS provider and wait for "Verified".
   - For a quick test without a domain you can use the sender `onboarding@resend.dev`, but Resend then only delivers to your own account e-mail.
3. **API Keys → Create API key** with "Sending access", and copy it (`re_…`).
4. Add it to the host as runtime secrets (Cloudflare: Settings → Variables and Secrets, type Secret): `EMAIL_PROVIDER` = `resend` and `RESEND_API_KEY` = `re_…`.
5. In `src/config/business.ts → email`, set `fromAddress` to an address on the verified domain (e.g. `pieraksti@salons.lv`), `fromName`, and `ownerNotifyTo` (owner's address, or `''` for no copies).

**Brevo setup (alternative)**
1. Create an account at [brevo.com](https://www.brevo.com) and verify the sender or domain under **Senders, Domains & Dedicated IPs**.
2. **SMTP & API → API Keys → Generate a new API key**.
3. **Security → Authorised IPs**: deactivate the blocking of unknown IP addresses. Otherwise Brevo rejects calls from Cloudflare, which has no fixed IP.
4. Set `EMAIL_PROVIDER` = `brevo` and `BREVO_API_KEY`, and fill `business.ts → email` as above.

**What is sent**

| Event | Customer | Owner (`ownerNotifyTo`) |
|---|---|---|
| Online booking | confirmation with cancel link | copy |
| Admin creates a booking with "Nosūtīt klientam apstiprinājumu" ticked (customer has e-mail) | confirmation with cancel link | – |
| Admin reschedules with "Paziņot klientam…" ticked | new time | – |
| Admin cancels with "Paziņot klientam e-pastā" ticked | cancellation notice | – |
| Customer cancels via the link | – (the page confirms) | notice |

> Not included: a reminder e-mail the day before the visit. It needs a scheduled job (Cloudflare Cron Trigger); ask Claude Code to add it if you want it.

---

## Customize for a new client

See **[NEW_CLIENT_CHECKLIST.md](NEW_CLIENT_CHECKLIST.md)**, a step-by-step list that takes about an hour. In short:

1. Edit `src/config/business.ts` (name, contacts, hours, colors, texts, gallery, reviews, SEO, legal).
2. Replace the images in `public/images/`, then run `npm run og-image` (or replace `og-image.png`).
3. Create a new Supabase project, push the migrations and create the admin.
4. Deploy with that project's environment variables.
5. Log in to `/admin` and add services, masters, working hours and closed days.

If you use Claude Code, read **CLAUDE.md** for the project rules. For example:
"Configure this template for client X: …".

---

## Tests

```bash
npm test             # unit tests: slot calculation, Riga time zone / DST, formatting (no DB needed)
npx supabase start
npm run test:db      # database tests against the local Supabase
```

The database tests cover:
- **RLS:** anonymous visitors and logged-in non-admins cannot read customer data or change bookings; admins can.
- **Double booking:** 12 parallel connections booking the same slot produce exactly one booking. "Any master" requests in parallel get one booking per master. Overlapping times collide correctly.
- **Booking rules:** working hours, breaks, closed days, blocks, buffer, notice, horizon, required e-mail, per-e-mail limit, cancel link.
- **Parity:** every time the website offers is accepted by the database, and every time it doesn't offer is refused.

---

## How booking safety works

- The website computes free slots in TypeScript (`src/lib/booking/slots.ts`) to show to the visitor.
- The booking itself goes through the `create_booking()` Postgres function, called by the server with the service-role key. It re-checks every rule.
- The `bookings_no_overlap` **exclusion constraint** makes overlapping confirmed bookings of one master impossible at the database level. This also covers admin edits and simultaneous requests.
- The public cannot read the `bookings` table at all (RLS). The availability view uses `get_public_schedule()`, which returns only time ranges.
- Spam protection: a honeypot field, a per-IP rate limit, and a maximum number of active future bookings per e-mail address (a setting).

---

## Privacy / GDPR notes

- The privacy policy (`/privatuma-politika`) is a **template**. Fill in `business.legal`, check the processors list, and have the final text reviewed for each client.
- Customer data is stored in the EU (Supabase Frankfurt). Sign the data processing agreements (DPA) that Supabase, Cloudflare/Netlify and your e-mail provider (Resend or Brevo) offer in their dashboards or terms.
- Retention: old bookings can be anonymized in **/admin → Iestatījumi → Dzēst vecos datus** (the period is a setting, 24 months by default). You can automate it with Supabase `pg_cron`: `select cron.schedule('anonymize', '0 3 * * 0', 'select public.anonymize_old_bookings()');`
- No analytics or marketing cookies are used. If you add any, replace the informational notice with a real consent banner.

---

## Operations and troubleshooting

- **Supabase free tier pausing:** free projects are paused after about a week without activity. A site with regular visitors stays active. For a production client, the Pro plan (backups included) is the safe choice, or check the project weekly.
- **Backups:** on the free tier, export regularly with `npx supabase db dump --data-only > backup.sql` (after `supabase link`).
- **"Šim meistaram šajā laikā jau ir cits pieraksts"** in the admin panel means the database refused an overlap. Pick another time or master.
- **The admin login says the password is wrong**, but the password is right: check that the Email provider is enabled in Supabase Auth, and that `create-admin` ran against the same project as the site.
- **No slots shown:** check the master's working hours, that the master is active and has the service ticked, closed days, and the "minimum notice" setting.
- **Confirmation e-mails do not arrive:** open **/admin → Iestatījumi**, which shows the active provider or the reason e-mails are off. Then check:
  - the sender domain is verified with the provider;
  - `business.email.fromAddress` is on that domain;
  - the Worker logs (`[email] resend 4xx …`) for the provider's error message;
  - with Brevo, that IP blocking is off.
- **Photos do not upload:** check that the migrations ran (they create the `media` bucket). The maximum size is 5 MB, as JPG, PNG, WebP or AVIF.
