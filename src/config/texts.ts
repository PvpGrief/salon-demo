/**
 * Generic Latvian interface texts (buttons, form labels, messages).
 * Business-specific content is in ./business.ts – usually you do not need to
 * touch this file for a new client, but you can adjust wording here.
 */

export const t = {
  nav: {
    services: 'Pakalpojumi',
    masters: 'Meistari',
    gallery: 'Galerija',
    reviews: 'Atsauksmes',
    contact: 'Kontakti',
    availability: 'Brīvie laiki',
    book: 'Pieteikties',
    menu: 'Izvēlne',
    close: 'Aizvērt',
    skipToContent: 'Pāriet uz saturu',
  },
  services: {
    duration: 'Ilgums',
    priceFrom: 'no',
    priceOnRequest: 'pēc vienošanās',
    book: 'Pieteikties',
  },
  masters: {
    book: 'Pierakstīties pie meistara',
  },
  contact: {
    phone: 'Tālrunis',
    email: 'E-pasts',
    address: 'Adrese',
    hours: 'Darba laiks',
    closed: 'Slēgts',
    openMap: 'Atvērt kartē',
    mapTitle: 'Salona atrašanās vieta kartē',
  },
  booking: {
    title: 'Pieteikties vizītei',
    intro: 'Četri vienkārši soļi – pieraksts tiek apstiprināts uzreiz.',
    steps: ['Pakalpojums', 'Meistars', 'Laiks', 'Dati'],
    chooseService: 'Izvēlieties pakalpojumu',
    chooseMaster: 'Izvēlieties meistaru',
    anyMaster: 'Jebkurš brīvais meistars',
    anyMasterHint: 'Piedāvāsim visus brīvos laikus',
    chooseTime: 'Izvēlieties datumu un laiku',
    noSlotsDay: 'Šajā dienā brīvu laiku nav. Lūdzu, izvēlieties citu dienu.',
    noSlotsRange: 'Tuvākajās dienās brīvu laiku nav. Apskatiet nākamās dienas vai zvaniet mums.',
    earlier: 'Iepriekšējās dienas',
    later: 'Nākamās dienas',
    loading: 'Ielādē…',
    back: 'Atpakaļ',
    next: 'Turpināt',
    yourDetails: 'Jūsu kontaktinformācija',
    name: 'Vārds, uzvārds',
    email: 'E-pasts',
    emailHint: 'Uz šo adresi nosūtīsim apstiprinājumu un atcelšanas saiti',
    comment: 'Komentārs (neobligāti)',
    commentHint: 'Piemēram, vēlamais matu garums vai alerģijas',
    summary: 'Jūsu pieraksts',
    service: 'Pakalpojums',
    master: 'Meistars',
    date: 'Datums',
    time: 'Laiks',
    price: 'Cena',
    confirm: 'Apstiprināt pierakstu',
    submitting: 'Notiek pieraksts…',
    consent: 'Apstiprinot pierakstu, jūs piekrītat, ka jūsu dati tiks apstrādāti pieraksta nodrošināšanai saskaņā ar',
    privacyLink: 'privātuma politiku',
    successTitle: 'Paldies! Jūs esat pierakstīts.',
    successEmail: 'Apstiprinājums nosūtīts uz',
    cancelHere: 'Ja nevarēsiet ierasties, atceliet pierakstu šeit',
    successNoEmail: 'Saglabājiet šo informāciju vai uzņemiet ekrānuzņēmumu.',
    addToCalendar: 'Pievienot kalendāram',
    newBooking: 'Veikt vēl vienu pierakstu',
    home: 'Uz sākumlapu',
    required: 'Obligāti aizpildāms lauks',
    invalidEmail: 'Lūdzu, ievadiet derīgu e-pasta adresi',
  },
  availability: {
    title: 'Brīvie laiki',
    intro:
      'Šeit redzams, kuri meistari ir brīvi un kuri aizņemti. Klientu dati netiek rādīti. Lai pierakstītos, izvēlieties brīvu laiku.',
    free: 'Brīvs',
    busy: 'Aizņemts',
    notWorking: 'Nestrādā',
    closedDay: 'Salons slēgts',
    freeWindows: 'Brīvs',
    noFree: 'Šajā dienā brīvu laiku nav',
    book: 'Pierakstīties',
    prevWeek: 'Iepriekšējā nedēļa',
    nextWeek: 'Nākamā nedēļa',
  },
  cancel: {
    title: 'Pieraksta atcelšana',
    confirmQuestion: 'Vai tiešām vēlaties atcelt šo pierakstu?',
    confirm: 'Jā, atcelt pierakstu',
    keep: 'Nē, saglabāt',
    done: 'Pieraksts ir atcelts. Paldies, ka paziņojāt!',
    alreadyCancelled: 'Šis pieraksts jau ir atcelts.',
    tooLate: 'Pierakstu vairs nevar atcelt tiešsaistē. Lūdzu, zvaniet mums:',
    notFound: 'Pieraksts nav atrasts. Iespējams, saite ir nepilnīga.',
  },
  cookies: {
    text: 'Mēs izmantojam tikai tehniski nepieciešamās sīkdatnes un neizsekojam jūsu darbības. Jūsu dati tiek izmantoti tikai pieraksta nodrošināšanai.',
    more: 'Privātuma politika',
    ok: 'Sapratu',
  },
  footer: {
    privacy: 'Privātuma politika',
    rights: 'Visas tiesības aizsargātas.',
    admin: 'Administrācija',
  },
  errors: {
    service_not_found: 'Izvēlētais pakalpojums vairs nav pieejams. Lūdzu, izvēlieties citu.',
    master_not_found: 'Izvēlētais meistars šo pakalpojumu nesniedz. Lūdzu, izvēlieties citu meistaru.',
    invalid_input: 'Lūdzu, pārbaudiet ievadītos datus.',
    too_soon: 'Šis laiks ir pārāk tuvu. Lūdzu, izvēlieties vēlāku laiku.',
    too_far: 'Tik tālu uz priekšu pierakstīties vēl nevar. Lūdzu, izvēlieties tuvāku datumu.',
    too_many_bookings:
      'Ar šo e-pasta adresi jau ir vairāki aktīvi pieraksti. Lūdzu, sazinieties ar mums pa tālruni.',
    slot_unavailable: 'Diemžēl šis laiks tikko tika aizņemts. Lūdzu, izvēlieties citu laiku.',
    booking_not_found: 'Pieraksts nav atrasts vai jau ir atcelts.',
    cancel_too_late: 'Pierakstu vairs nevar atcelt tiešsaistē. Lūdzu, zvaniet mums.',
    rate_limited: 'Pārāk daudz mēģinājumu. Lūdzu, uzgaidiet mirkli un mēģiniet vēlreiz.',
    generic: 'Radās kļūda. Lūdzu, mēģiniet vēlreiz vai zvaniet mums.',
  },
} as const;

export type ErrorCode = keyof typeof t.errors;

/** Map a database/server error message to Latvian text. */
export function errorText(code: string | undefined | null): string {
  if (code && code in t.errors) return t.errors[code as ErrorCode];
  return t.errors.generic;
}

/** Extract our machine-readable code from a Postgres error message. */
export function errorCode(message: string | undefined | null): ErrorCode {
  const m = (message ?? '').trim();
  return (m in t.errors ? m : 'generic') as ErrorCode;
}
