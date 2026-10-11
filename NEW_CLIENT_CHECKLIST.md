# New client checklist

Turn this template into a live site for a new client. Expect about 1 hour once
you have the client's information.

## 0. Collect from the client

- [ ] Business name (full and short), logo (SVG or PNG), 2–3 brand colors
- [ ] Address, phone, e-mail, map location, opening hours, social links
- [ ] Company name, registration number and legal address (for the privacy policy)
- [ ] Services: name, duration, price ("from" prices?), category
- [ ] Masters: name, title, short bio, portrait photo (vertical 4:5), services, weekly hours and breaks
- [ ] Closed days and holidays, planned vacations
- [ ] Gallery photos (6+, square) and 3 short reviews
- [ ] Domain name and who controls its DNS
- [ ] The e-mail address that should receive booking copies

## 1. Copy the template

- [ ] Create a new repository from this template (GitHub **Use this template**, or clone it and push to a new repo).
- [ ] `npm install`

## 2. Content and branding (`src/config/business.ts`)

- [ ] `name`, `shortName`, `siteUrl` (the final domain, `https://…`, no trailing slash)
- [ ] `contact`: phone, email, address, `geo` (lat/lng from openstreetmap.org), `directionsNote`
- [ ] `openingHours` (shown on the site; bookable times come from each master's hours in /admin)
- [ ] `social` links (empty string `''` hides one)
- [ ] `theme` colors: `primary` must have good contrast with white text
- [ ] `seo.title`, `seo.description` (up to about 155 characters, Latvian, include the city), `seo.schemaType` (`BeautySalon`, `HairSalon`, `NailSalon`, …)
- [ ] `hero` texts, `sections` titles and intros
- [ ] `gallery` items (paths and Latvian `alt` texts) and `reviews`
- [ ] `booking.arrivalNote`, `booking.cancellationPolicy` (match the cancel hours in /admin settings)
- [ ] `email.fromName`, `email.fromAddress`, `email.ownerNotifyTo`
- [ ] `legal`: company name, registration no., legal address, privacy e-mail, `privacyUpdated` date, and `processors` (remove Brevo if no e-mails; use Netlify instead of Cloudflare if hosting there)

## 3. Images (`public/images/`)

- [ ] `logo.svg` (or PNG; update `logo.src`) and `public/favicon.svg`
- [ ] `hero.svg` → the client's hero photo, e.g. `hero.webp` 1280×1120, under 250 KB; update `hero.image`
- [ ] `gallery/…` → client photos, square, about 800×800 WebP or JPG, under 150 KB each
- [ ] `npm run og-image` to regenerate `og-image.png` (1200×630) from the name and colors, or design your own
- [ ] Master photos are uploaded later in /admin. The SVGs in `masters/` are only for the demo seed.

Check the result with `npm run dev`. The site works without a database for the
static sections.

## 4. Supabase (new project per client)

- [ ] Create the project at supabase.com, region **EU Central (Frankfurt)**, and save the DB password.
- [ ] Authentication → Sign In / Providers: Email **enabled**, **"Allow new users to sign up" OFF**.
- [ ] `npx supabase link --project-ref <ref>` then `npm run db:push`
- [ ] Do **not** load `seed.sql` for a real client (only for demos: `npx supabase db push --include-seed`).
- [ ] Put the project's `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in `.env`.
- [ ] `npm run create-admin -- <owner e-mail>` and send the printed password to the owner securely.

## 5. E-mail (optional)

- [ ] Brevo account: verify the client's domain or sender address and create an API key.
- [ ] Set `BREVO_API_KEY` in the hosting environment, and `email.fromAddress` to the verified sender.

## 6. Deploy (Cloudflare Workers)

- [ ] `wrangler.jsonc` → `"name"`: a unique Worker name, e.g. `salons-aurora`. Commit and push it to the branch you will deploy (usually `main`).
- [ ] Cloudflare → Workers & Pages → Create → Import a repository, using the **same Worker name** as in `wrangler.jsonc`.
- [ ] Build settings: production branch `main`, build command `npm run build`, deploy command `npx wrangler deploy`, root directory empty.
- [ ] Worker → Settings → Variables and Secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (type Secret), optional `BREVO_API_KEY`. Then redeploy.
- [ ] Settings → Domains & Routes → add the custom domain.
- [ ] (Netlify instead: see README → "Deploy to Netlify".)

## 7. Fill the admin panel (with the owner if possible)

- [ ] `/admin/pakalpojumi`: add every service (duration, price, category, order)
- [ ] `/admin/meistari`: add masters with photo, services and weekly hours (with break)
- [ ] `/admin/bloki`: public holidays and planned vacations
- [ ] `/admin/iestatijumi`: slot step, buffer, minimum notice, days ahead, cancel hours, retention

## 8. Final checks

- [ ] Make a test booking on a phone. Check it appears in /admin and the e-mail arrives (if enabled). Then cancel it with the e-mail link.
- [ ] `/pieejamiba` shows the right free and busy times.
- [ ] `/privatuma-politika` shows the correct company details. Have the text reviewed.
- [ ] Check the share preview (paste the URL into WhatsApp/Facebook) and the [Rich Results Test](https://search.google.com/test/rich-results).
- [ ] Submit `https://<domain>/sitemap.xml` in Google Search Console, and create or link the Google Business Profile.
- [ ] Sign the DPAs (Supabase, Cloudflare/Netlify, Brevo). Decide on backups (Supabase Pro, or a regular `supabase db dump`).
- [ ] Hand over to the owner: the admin URL, the login, and how to block days and add phone bookings.
