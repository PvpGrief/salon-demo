/** Opening-hours display rows and schema.org LocalBusiness JSON-LD. */
import { business } from '../config/business';
import { t } from '../config/texts';
import type { MasterRow, ServiceRow } from './booking/availability';
import { WEEKDAYS_LV } from './time';

const SCHEMA_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function hoursForDay(day: number): string | null {
  const parts = business.openingHours
    .filter((h) => (h.days as readonly number[]).includes(day))
    .map((h) => `${h.opens}–${h.closes}`);
  return parts.length ? parts.join(', ') : null;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** [{ label: 'Pirmdiena–piektdiena', value: '09:00–20:00' }, { label: 'Svētdiena', value: 'Slēgts' }] */
export function openingHoursRows(): { label: string; value: string }[] {
  const rows: { from: number; to: number; value: string }[] = [];
  for (let d = 1; d <= 7; d++) {
    const value = hoursForDay(d) ?? t.contact.closed;
    const last = rows.at(-1);
    if (last && last.value === value && last.to === d - 1) last.to = d;
    else rows.push({ from: d, to: d, value });
  }
  return rows.map((r) => ({
    label: r.from === r.to ? cap(WEEKDAYS_LV[r.from - 1]) : `${cap(WEEKDAYS_LV[r.from - 1])}–${WEEKDAYS_LV[r.to - 1]}`,
    value: r.value,
  }));
}

export function localBusinessJsonLd(services: ServiceRow[] = [], masters: MasterRow[] = []) {
  const url = business.siteUrl;
  const c = business.contact;
  const sameAs = Object.values(business.social).filter(Boolean);
  return {
    '@context': 'https://schema.org',
    '@type': business.seo.schemaType,
    '@id': `${url}/#business`,
    name: business.name,
    url,
    image: new URL(business.seo.ogImage, url).href,
    logo: new URL(business.logo.src, url).href,
    description: business.seo.description,
    telephone: c.phone.replace(/\s/g, ''),
    email: c.email,
    priceRange: business.seo.priceRange,
    address: {
      '@type': 'PostalAddress',
      streetAddress: c.address.street,
      addressLocality: c.address.city,
      postalCode: c.address.postalCode,
      addressCountry: c.address.country,
    },
    geo: { '@type': 'GeoCoordinates', latitude: c.geo.lat, longitude: c.geo.lng },
    openingHoursSpecification: business.openingHours.map((h) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: h.days.map((d) => SCHEMA_DAYS[d - 1]),
      opens: h.opens,
      closes: h.closes,
    })),
    ...(sameAs.length ? { sameAs } : {}),
    ...(masters.length ? { employee: masters.map((m) => ({ '@type': 'Person', name: m.name, jobTitle: m.title || undefined })) } : {}),
    ...(services.length
      ? {
          hasOfferCatalog: {
            '@type': 'OfferCatalog',
            name: 'Pakalpojumi',
            itemListElement: services.map((s) => ({
              '@type': 'Offer',
              itemOffered: { '@type': 'Service', name: s.name, description: s.description || undefined },
              ...(s.price_eur !== null
                ? s.price_from
                  ? { priceSpecification: { '@type': 'PriceSpecification', minPrice: Number(s.price_eur), priceCurrency: 'EUR' } }
                  : { price: Number(s.price_eur), priceCurrency: 'EUR' }
                : {}),
            })),
          },
        }
      : {}),
  };
}
