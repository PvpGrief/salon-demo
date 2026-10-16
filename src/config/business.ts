/**
 * ============================================================================
 *  CLIENT CONFIGURATION – edit this file for each new client.
 * ============================================================================
 *
 * Everything business-specific that is NOT edited in the admin panel lives
 * here: name, contacts, opening hours shown on the site, colors, texts,
 * gallery, reviews, SEO, privacy-policy details, e-mail sender.
 *
 * Edited in the admin panel (database) instead: services and prices, masters
 * and their photos, working hours per master, closed days, blocks, booking
 * rules (slot step, notice period, …).
 *
 * Images live in /public/images – replace the files, keep or update the paths.
 * All visitor-facing text must be Latvian.
 */

export const business = {
  // --------------------------------------------------------------- identity
  name: 'Skaistumkopšanas salons Aurora',
  shortName: 'Aurora',
  /**
   * Production URL without trailing slash (canonical URLs, sitemap, Open Graph).
   * DEMO: fictional domain. For a demo on *.workers.dev set SITE_URL instead.
   */
  siteUrl: 'https://www.salonsaurora.lv',
  logo: {
    src: '/images/logo.svg',
    alt: 'Aurora logotips',
    /** Show the name next to the logo in the header. */
    showName: true,
  },
  favicon: '/favicon.svg',

  // --------------------------------------------------------------- contacts
  // DEMO values below are fictional – replace all of them per client.
  contact: {
    phone: '+371 67 280 415',
    email: 'info@salonsaurora.lv',
    address: {
      street: 'Tērbatas iela 10',
      city: 'Rīga',
      postalCode: 'LV-1011',
      country: 'LV',
    },
    /**
     * Map pin. DEMO: approximate, near Vērmanes dārzs. Per client: openstreetmap.org →
     * search the address → right-click the building → "Show address" → copy lat/lng.
     */
    geo: { lat: 56.9549, lng: 24.1213 },
    mapZoom: 16,
    /** Optional extra line under the address, e.g. parking info. */
    directionsNote: 'Ieeja no Tērbatas ielas, 2. stāvs. Tuvākā stāvvieta – Ģertrūdes ielā.',
  },

  /**
   * Opening hours shown on the website (salon level).
   * Days: 1 = pirmdiena … 7 = svētdiena. Days not listed are shown as "Slēgts".
   * Bookable times come from each master's working hours in the admin panel.
   */
  openingHours: [
    { days: [1, 2, 3, 4, 5], opens: '09:00', closes: '20:00' },
    { days: [6], opens: '10:00', closes: '16:00' },
  ],

  /** Full profile URLs. Empty string '' hides a link. DEMO: fictional handles. */
  social: {
    instagram: 'https://www.instagram.com/salonsaurora.riga',
    facebook: 'https://www.facebook.com/salonsaurora.riga',
    tiktok: 'https://www.tiktok.com/@salonsaurora',
  },

  // --------------------------------------------------------------- design
  /**
   * Brand colors (any CSS color). Lighter/darker shades are derived
   * automatically. Keep enough contrast: text on `primary` is white.
   */
  theme: {
    primary: '#8a4b5c', // buttons, links, accents
    accent: '#c59d5f', // small highlights (stars, badges)
    background: '#fbf8f6', // page background
    surface: '#ffffff', // cards
    text: '#2b2326', // main text
    muted: '#6f6468', // secondary text
  },

  // --------------------------------------------------------------- SEO
  seo: {
    title: 'Aurora – skaistumkopšanas salons Rīgā | Pieraksts tiešsaistē',
    description:
      'Matu griezumi, krāsošana, manikīrs un uzacu korekcija Rīgas centrā. Izvēlieties meistaru un brīvu laiku – pierakstieties tiešsaistē 24/7.',
    /** 1200×630 PNG/JPG for Facebook/WhatsApp previews. */
    ogImage: '/images/og-image.png',
    /** schema.org type: BeautySalon, HairSalon, NailSalon, DaySpa, HealthAndBeautyBusiness … */
    schemaType: 'BeautySalon',
    priceRange: '€€',
  },

  // --------------------------------------------------------------- page sections
  hero: {
    eyebrow: 'Skaistumkopšanas salons Rīgas centrā',
    title: 'Jūsu skaistums – mūsu rūpes',
    subtitle:
      'Pieredzējuši meistari, kvalitatīva kosmētika un mierīga atmosfēra. Izvēlieties pakalpojumu, meistaru un sev ērtu laiku – pieraksts aizņem mazāk nekā minūti.',
    image: '/images/hero.svg',
    imageAlt: 'Mājīgs salona interjers',
    ctaPrimary: 'Pieteikties',
    ctaSecondary: 'Skatīt pakalpojumus',
    highlights: ['Pieraksts tiešsaistē 24/7', 'Sertificēti meistari', 'Apstiprinājums uzreiz'],
  },

  sections: {
    services: {
      title: 'Pakalpojumi un cenas',
      intro: 'Cenas norādītas eiro, ieskaitot PVN. Precīzu cenu meistars apstiprinās pirms procedūras.',
    },
    masters: {
      title: 'Mūsu meistari',
      intro: 'Izvēlieties sev tīkamāko meistaru vai ļaujiet mums atrast pirmo brīvo laiku.',
    },
    gallery: {
      title: 'Mūsu darbi',
      intro: 'Nedaudz no tā, ko esam radījuši kopā ar saviem klientiem.',
    },
    reviews: {
      title: 'Klientu atsauksmes',
      intro: 'Paldies par uzticēšanos!',
    },
    contact: {
      title: 'Kontakti un darba laiks',
      intro: 'Gaidīsim jūs! Ja vēlaties pierakstīties pa tālruni, zvaniet darba laikā.',
    },
  },

  gallery: [
    { src: '/images/gallery/gallery-1.svg', alt: 'Matu krāsošanas rezultāts' },
    { src: '/images/gallery/gallery-2.svg', alt: 'Manikīrs ar gēllaku' },
    { src: '/images/gallery/gallery-3.svg', alt: 'Sieviešu matu griezums' },
    { src: '/images/gallery/gallery-4.svg', alt: 'Salona darba vieta' },
    { src: '/images/gallery/gallery-5.svg', alt: 'Uzacu korekcija' },
    { src: '/images/gallery/gallery-6.svg', alt: 'Vīriešu matu griezums' },
  ],

  reviews: [
    {
      name: 'Kristīne',
      rating: 5,
      text: 'Beidzot atradu savu friziera salonu! Anna ieklausījās katrā vēlmē, un krāsa izdevās tieši tāda, kādu gribēju.',
    },
    {
      name: 'Jānis',
      rating: 5,
      text: 'Ērts pieraksts internetā, nekādas gaidīšanas. Mārtiņš strādā ātri un precīzi.',
    },
    {
      name: 'Elīna',
      rating: 5,
      text: 'Manikīrs turas jau trešo nedēļu. Ļoti tīrs un patīkams salons, noteikti nākšu vēl.',
    },
  ],

  // --------------------------------------------------------------- booking
  booking: {
    /** How many days the date picker shows at once. */
    daysInPicker: 14,
    /** Shown on the confirmation screen and in the e-mail. */
    arrivalNote: 'Lūdzu, ierodieties 5 minūtes pirms noteiktā laika.',
    /** Shown under the booking form and in the e-mail. */
    cancellationPolicy:
      'Ja nevarat ierasties, lūdzu, atceliet pierakstu vismaz 24 stundas iepriekš – ar saiti apstiprinājuma e-pastā vai zvanot mums.',
  },

  // --------------------------------------------------------------- e-mail (optional)
  /**
   * Provider and key are environment variables: EMAIL_PROVIDER=resend|brevo
   * plus RESEND_API_KEY or BREVO_API_KEY (see README). Without a key no
   * e-mails are sent and the site works normally.
   */
  email: {
    /** Must be an address on a domain verified with your provider (Resend: Domains; Brevo: Senders). */
    fromName: 'Salons Aurora',
    fromAddress: 'pieraksti@salonsaurora.lv',
    /**
     * Owner gets a copy of every new/cancelled booking (customer name + e-mail). Empty = off.
     * DEMO: off on purpose – a fictional address could belong to a stranger.
     * Set your own address to test, and the owner's address per client.
     */
    ownerNotifyTo: '',
  },

  // --------------------------------------------------------------- legal / GDPR
  legal: {
    /** Data controller shown in the privacy policy. */
    /** DEMO: fictional company and registration number. */
    companyName: 'SIA "Aurora Beauty Studio"',
    registrationNumber: '40203456789',
    legalAddress: 'Tērbatas iela 10, Rīga, LV-1011',
    privacyEmail: 'info@salonsaurora.lv',
    /** Date the privacy policy was last updated (YYYY-MM-DD). */
    privacyUpdated: '2026-10-11',
    /** Service providers listed in the privacy policy. Remove ones you do not use. */
    processors: [
      { name: 'Supabase, Inc.', purpose: 'datu bāze (dati tiek glabāti Eiropas Savienībā, Frankfurtē, Vācijā)' },
      { name: 'Cloudflare, Inc.', purpose: 'vietnes mitināšana un drošība' },
      // E-mail provider: keep the one you use (EMAIL_PROVIDER).
      { name: 'Resend, Inc., ASV', purpose: 'pieraksta apstiprinājumu un paziņojumu nosūtīšana e-pastā' },
      // { name: 'Brevo (Sendinblue SAS), Francija', purpose: 'pieraksta apstiprinājumu un paziņojumu nosūtīšana e-pastā' },
      { name: 'OpenStreetMap Foundation', purpose: 'karte sadaļā „Kontakti” (karte ielādējas no OpenStreetMap serveriem)' },
    ],
  },
} as const;

export type Business = typeof business;
