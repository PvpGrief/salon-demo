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
  /** Production URL without trailing slash (used for SEO, sitemap, e-mails). */
  siteUrl: 'https://www.example.lv',
  logo: {
    src: '/images/logo.svg',
    alt: 'Aurora logotips',
    /** Show the name next to the logo in the header. */
    showName: true,
  },
  favicon: '/favicon.svg',

  // --------------------------------------------------------------- contacts
  contact: {
    phone: '+371 20 000 000',
    email: 'info@example.lv',
    address: {
      street: 'Brīvības iela 100',
      city: 'Rīga',
      postalCode: 'LV-1001',
      country: 'LV',
    },
    /** Map pin (find on openstreetmap.org → right-click → "Show address"). */
    geo: { lat: 56.9589, lng: 24.1255 },
    mapZoom: 16,
    /** Optional extra line under the address, e.g. parking info. */
    directionsNote: 'Ieeja no pagalma, 2. stāvs. Bezmaksas stāvvieta sētā.',
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

  social: {
    instagram: 'https://www.instagram.com/',
    facebook: 'https://www.facebook.com/',
    tiktok: '',
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
      'Ja nevarat ierasties, lūdzu, atceliet pierakstu vismaz 24 stundas iepriekš – izmantojot saiti e-pastā vai zvanot mums.',
  },

  // --------------------------------------------------------------- e-mail (Brevo, optional)
  email: {
    /** Sender must be verified in Brevo (Senders & IP). */
    fromName: 'Salons Aurora',
    fromAddress: 'pieraksti@example.lv',
    /** Owner gets a copy of every new/cancelled booking. Empty = off. */
    ownerNotifyTo: 'info@example.lv',
  },

  // --------------------------------------------------------------- legal / GDPR
  legal: {
    /** Data controller shown in the privacy policy. */
    companyName: 'SIA "Aurora Beauty"',
    registrationNumber: '40000000000',
    legalAddress: 'Brīvības iela 100, Rīga, LV-1001',
    privacyEmail: 'info@example.lv',
    /** Date the privacy policy was last updated (YYYY-MM-DD). */
    privacyUpdated: '2026-10-11',
    /** Service providers listed in the privacy policy. Remove ones you do not use. */
    processors: [
      { name: 'Supabase, Inc.', purpose: 'datu bāze (dati tiek glabāti Eiropas Savienībā, Frankfurtē, Vācijā)' },
      { name: 'Cloudflare, Inc.', purpose: 'vietnes mitināšana un drošība' },
      { name: 'Brevo (Sendinblue SAS), Francija', purpose: 'apstiprinājuma e-pastu nosūtīšana, ja norādāt e-pastu' },
      { name: 'OpenStreetMap Foundation', purpose: 'karte sadaļā „Kontakti” (karte ielādējas no OpenStreetMap serveriem)' },
    ],
  },
} as const;

export type Business = typeof business;
