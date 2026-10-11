/**
 * Booking wizard (React island on /pieteikties).
 * Steps: service → master → date & time → contact details → confirmation.
 * Free slots come from GET /api/slots; the booking is created by the
 * `createBooking` action, which re-checks everything in the database.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { actions } from 'astro:actions';
import { t } from '../../config/texts';
import {
  addDays,
  diffDays,
  formatDate,
  formatDateShort,
  formatDateWithWeekday,
  formatDuration,
  toRigaDate,
  toRigaTime,
  weekdayShort,
} from '../../lib/time';
import { isEmail, normalizePhone } from '../../lib/format';

export interface WizardService {
  id: string;
  name: string;
  description: string;
  category: string;
  durationMin: number;
  priceLabel: string;
}

export interface WizardMaster {
  id: string;
  name: string;
  title: string;
  photoUrl: string | null;
  serviceIds: string[];
}

interface Props {
  services: WizardService[];
  masters: WizardMaster[];
  initialServiceId?: string | null;
  initialMasterId?: string | null;
  today: string;
  daysInPicker: number;
  maxDaysAhead: number;
  phone: string;
  arrivalNote: string;
  cancellationPolicy: string;
  businessName: string;
  location: string;
}

type Step = 'service' | 'master' | 'time' | 'details' | 'done';
const STEP_INDEX: Record<Step, number> = { service: 0, master: 1, time: 2, details: 3, done: 4 };

interface DaySlots {
  date: string;
  closed: boolean;
  slots: { time: string; start: string; masters: string[] }[];
}

interface Result {
  serviceName: string;
  masterName: string;
  startsAt: string;
  endsAt: string;
  emailSent: boolean;
  email: string | null;
  location: string;
}

const ANY = 'any';

function partOfDay(time: string): 0 | 1 | 2 {
  const h = Number(time.slice(0, 2));
  return h < 12 ? 0 : h < 17 ? 1 : 2;
}
const PART_LABELS = ['Rīts', 'Pēcpusdiena', 'Vakars'];

export default function BookingWizard(props: Props) {
  const { services, masters, today, daysInPicker, maxDaysAhead } = props;

  const initialService = services.find((s) => s.id === props.initialServiceId) ?? null;
  const initialMaster = masters.find((m) => m.id === props.initialMasterId) ?? null;

  const [step, setStep] = useState<Step>(initialService ? (initialMaster ? 'time' : 'master') : 'service');
  const [serviceId, setServiceId] = useState<string | null>(initialService?.id ?? null);
  const [masterId, setMasterId] = useState<string>(initialMaster?.id ?? ANY);
  const [onlyMaster, setOnlyMaster] = useState<string | null>(initialMaster && !initialService ? initialMaster.id : null);

  const [fromDate, setFromDate] = useState(today);
  const [days, setDays] = useState<DaySlots[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<{ time: string; start: string } | null>(null);

  const [form, setForm] = useState({ name: '', phone: '', email: '', comment: '', website: '' });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const service = services.find((s) => s.id === serviceId) ?? null;
  const master = masters.find((m) => m.id === masterId) ?? null;
  const mastersForService = useMemo(
    () => (serviceId ? masters.filter((m) => m.serviceIds.includes(serviceId)) : []),
    [masters, serviceId],
  );

  // ---------------------------------------------------------------- history
  const go = useCallback((next: Step, push = true) => {
    setStep(next);
    if (push && typeof window !== 'undefined') {
      window.history.pushState({ step: next }, '', `#${next}`);
    }
  }, []);

  useEffect(() => {
    window.history.replaceState({ step }, '', `#${step}`);
    const onPop = (e: PopStateEvent) => {
      const s = (e.state?.step as Step | undefined) ?? 'service';
      setStep((current) => (current === 'done' ? 'done' : s));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
    headingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [step]);

  // ---------------------------------------------------------------- slots
  const loadSlots = useCallback(async () => {
    if (!serviceId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const qs = new URLSearchParams({ service: serviceId, master: masterId, from: fromDate, days: String(daysInPicker) });
      const res = await fetch(`/api/slots?${qs}`, { headers: { accept: 'application/json' } });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'generic');
      const list = body.days as DaySlots[];
      setDays(list);
      setDate((current) => {
        const stillOk = current && list.some((d) => d.date === current && d.slots.length > 0);
        return stillOk ? current : (list.find((d) => d.slots.length > 0)?.date ?? null);
      });
    } catch (e) {
      const code = (e as Error).message;
      setLoadError(code in t.errors ? t.errors[code as keyof typeof t.errors] : t.errors.generic);
      setDays(null);
    } finally {
      setLoading(false);
    }
  }, [serviceId, masterId, fromDate, daysInPicker]);

  useEffect(() => {
    if (step === 'time') void loadSlots();
  }, [step, loadSlots]);

  // ---------------------------------------------------------------- handlers
  function chooseService(id: string) {
    setServiceId(id);
    setSlot(null);
    setDays(null);
    const offering = masters.filter((m) => m.serviceIds.includes(id));
    if (!offering.some((m) => m.id === masterId)) setMasterId(ANY);
    if (onlyMaster && offering.some((m) => m.id === onlyMaster)) {
      setMasterId(onlyMaster);
      go('time');
    } else {
      go('master');
    }
  }

  function chooseMaster(id: string) {
    setMasterId(id);
    setSlot(null);
    setDays(null);
    go('time');
  }

  function chooseSlot(s: { time: string; start: string }) {
    setSlot(s);
    setSubmitError(null);
    setNotice(null);
    go('details');
  }

  const phoneOk = normalizePhone(form.phone) !== null;
  const emailOk = !form.email.trim() || isEmail(form.email.trim());
  const nameOk = form.name.trim().length >= 2;
  const formOk = phoneOk && emailOk && nameOk;

  async function submit(e: { preventDefault(): void }) {
    e.preventDefault();
    setTouched({ name: true, phone: true, email: true });
    if (!formOk || !service || !slot || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    const { data, error } = await actions.createBooking({
      serviceId: service.id,
      masterId: masterId === ANY ? null : masterId,
      startsAt: slot.start,
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      comment: form.comment.trim() || undefined,
      website: form.website,
    });
    setSubmitting(false);
    if (error) {
      if (error.code === 'CONFLICT') {
        setNotice(error.message);
        setSlot(null);
        go('time');
        return;
      }
      setSubmitError(error.code === 'BAD_REQUEST' && !error.message ? t.errors.invalid_input : error.message || t.errors.generic);
      return;
    }
    setResult(data);
    go('done');
  }

  function restart() {
    setServiceId(null);
    setMasterId(ANY);
    setOnlyMaster(null);
    setSlot(null);
    setDays(null);
    setResult(null);
    setFromDate(today);
    setForm((f) => ({ ...f, comment: '' }));
    go('service');
  }

  // ---------------------------------------------------------------- render helpers
  const servicesShown = onlyMaster
    ? services.filter((s) => masters.find((m) => m.id === onlyMaster)?.serviceIds.includes(s.id))
    : services;
  const groups = useMemo(() => {
    const map = new Map<string, WizardService[]>();
    for (const s of servicesShown) {
      if (!map.has(s.category)) map.set(s.category, []);
      map.get(s.category)!.push(s);
    }
    return [...map.entries()];
  }, [servicesShown]);

  const selectedDay = days?.find((d) => d.date === date) ?? null;
  const canGoEarlier = diffDays(today, fromDate) > 0;
  const canGoLater = diffDays(today, addDays(fromDate, daysInPicker)) <= maxDaysAhead;
  const anySlots = days?.some((d) => d.slots.length > 0) ?? false;

  return (
    <div className="mx-auto max-w-3xl">
      {step !== 'done' && <Progress index={STEP_INDEX[step]} />}

      <div className="mt-6">
        {/* ------------------------------------------------ step 1: service */}
        {step === 'service' && (
          <section aria-labelledby="step-title">
            <StepTitle refEl={headingRef}>{t.booking.chooseService}</StepTitle>
            {onlyMaster && (
              <p className="alert-info mt-3 flex flex-wrap items-center justify-between gap-2">
                <span>
                  {t.booking.master}: <strong>{masters.find((m) => m.id === onlyMaster)?.name}</strong>
                </span>
                <button type="button" className="font-medium text-brand underline" onClick={() => setOnlyMaster(null)}>
                  Rādīt visus pakalpojumus
                </button>
              </p>
            )}
            <div className="mt-5 space-y-6">
              {groups.map(([category, items]) => (
                <div key={category || 'other'}>
                  {category && <h3 className="mb-2 text-lg font-semibold">{category}</h3>}
                  <ul className="space-y-2">
                    {items.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => chooseService(s.id)}
                          className={`card flex w-full items-center gap-4 p-4 text-left transition hover:border-brand hover:shadow-md ${
                            s.id === serviceId ? 'border-brand ring-2 ring-brand/20' : ''
                          }`}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold">{s.name}</span>
                            {s.description && <span className="mt-0.5 block text-sm text-muted">{s.description}</span>}
                            <span className="mt-1 block text-sm text-muted">{formatDuration(s.durationMin)}</span>
                          </span>
                          <span className="text-right font-semibold whitespace-nowrap text-brand">{s.priceLabel}</span>
                          <Chevron />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ------------------------------------------------ step 2: master */}
        {step === 'master' && service && (
          <section aria-labelledby="step-title">
            <StepTitle refEl={headingRef}>{t.booking.chooseMaster}</StepTitle>
            <Chosen service={service} />
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              <li>
                <button
                  type="button"
                  onClick={() => chooseMaster(ANY)}
                  className={`card flex h-full w-full items-center gap-4 p-4 text-left transition hover:border-brand hover:shadow-md ${
                    masterId === ANY ? 'border-brand ring-2 ring-brand/20' : ''
                  }`}
                >
                  <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                    <svg className="size-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                      <path d="M16 19v-1a4 4 0 00-4-4H6a4 4 0 00-4 4v1M9 10a3 3 0 100-6 3 3 0 000 6zM22 19v-1a4 4 0 00-3-3.9M16 4.1a3 3 0 010 5.8" />
                    </svg>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{t.booking.anyMaster}</span>
                    <span className="block text-sm text-muted">{t.booking.anyMasterHint}</span>
                  </span>
                  <Chevron />
                </button>
              </li>
              {mastersForService.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => chooseMaster(m.id)}
                    className={`card flex h-full w-full items-center gap-4 p-4 text-left transition hover:border-brand hover:shadow-md ${
                      masterId === m.id ? 'border-brand ring-2 ring-brand/20' : ''
                    }`}
                  >
                    <img
                      src={m.photoUrl || '/images/masters/placeholder.svg'}
                      alt=""
                      width={64}
                      height={64}
                      className="size-16 shrink-0 rounded-full bg-brand-soft object-cover object-top"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{m.name}</span>
                      {m.title && <span className="block text-sm text-muted">{m.title}</span>}
                    </span>
                    <Chevron />
                  </button>
                </li>
              ))}
            </ul>
            <BackButton onClick={() => go('service')} />
          </section>
        )}

        {/* ------------------------------------------------ step 3: date & time */}
        {step === 'time' && service && (
          <section aria-labelledby="step-title">
            <StepTitle refEl={headingRef}>{t.booking.chooseTime}</StepTitle>
            <Chosen service={service} masterName={master?.name ?? t.booking.anyMaster} />
            {notice && (
              <p className="alert-error mt-4" role="alert">
                {notice}
              </p>
            )}

            <div className="mt-5 flex items-center justify-between gap-2">
              <button
                type="button"
                className="btn-ghost !min-h-9 !px-3 text-sm"
                disabled={!canGoEarlier || loading}
                onClick={() => setFromDate(diffDays(today, addDays(fromDate, -daysInPicker)) < 0 ? today : addDays(fromDate, -daysInPicker))}
              >
                ‹ <span className="hidden sm:inline">{t.booking.earlier}</span>
              </button>
              <p className="text-sm font-medium text-muted">
                {formatDate(fromDate)} – {formatDate(addDays(fromDate, daysInPicker - 1))}
              </p>
              <button
                type="button"
                className="btn-ghost !min-h-9 !px-3 text-sm"
                disabled={!canGoLater || loading}
                onClick={() => setFromDate(addDays(fromDate, daysInPicker))}
              >
                <span className="hidden sm:inline">{t.booking.later}</span> ›
              </button>
            </div>

            <div className="-mx-4 mt-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0" role="radiogroup" aria-label={t.booking.date}>
              <div className="flex gap-2">
                {(days ?? Array.from({ length: daysInPicker }, (_, i) => ({ date: addDays(fromDate, i), closed: false, slots: [] }))).map(
                  (d) => {
                    const available = d.slots.length > 0;
                    const selected = d.date === date;
                    return (
                      <button
                        key={d.date}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={!available || loading}
                        onClick={() => setDate(d.date)}
                        aria-label={`${formatDateWithWeekday(d.date)}${available ? '' : ' – nav brīvu laiku'}`}
                        className={`flex w-16 shrink-0 flex-col items-center rounded-2xl border px-2 py-2.5 text-sm transition ${
                          selected
                            ? 'border-brand bg-brand text-white'
                            : available
                              ? 'border-line bg-surface hover:border-brand'
                              : 'border-transparent bg-transparent text-muted/50'
                        } ${loading ? 'animate-pulse' : ''}`}
                      >
                        <span className="text-xs font-medium uppercase">{weekdayShort(d.date)}</span>
                        <span className="mt-0.5 text-base font-semibold tabular-nums">{formatDateShort(d.date)}</span>
                      </button>
                    );
                  },
                )}
              </div>
            </div>

            <div className="mt-5 min-h-40" aria-live="polite">
              {loading && <p className="text-muted">{t.booking.loading}</p>}
              {!loading && loadError && <p className="alert-error">{loadError}</p>}
              {!loading && !loadError && days && !anySlots && (
                <div className="alert-info">
                  <p>{t.booking.noSlotsRange}</p>
                  {canGoLater && (
                    <button type="button" className="mt-2 font-semibold text-brand underline" onClick={() => setFromDate(addDays(fromDate, daysInPicker))}>
                      {t.booking.later} ›
                    </button>
                  )}
                </div>
              )}
              {!loading && selectedDay && selectedDay.slots.length > 0 && (
                <div>
                  <h3 className="font-semibold">{formatDateWithWeekday(selectedDay.date)}</h3>
                  {[0, 1, 2].map((part) => {
                    const items = selectedDay.slots.filter((s) => partOfDay(s.time) === part);
                    if (!items.length) return null;
                    return (
                      <div key={part} className="mt-4">
                        <p className="mb-2 text-sm font-medium text-muted">{PART_LABELS[part]}</p>
                        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                          {items.map((s) => (
                            <li key={s.time}>
                              <button
                                type="button"
                                onClick={() => chooseSlot(s)}
                                className={`w-full rounded-xl border py-2.5 text-base font-semibold tabular-nums transition hover:border-brand hover:bg-brand-soft ${
                                  slot?.start === s.start ? 'border-brand bg-brand text-white hover:bg-brand-dark' : 'border-line bg-surface'
                                }`}
                              >
                                {s.time}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <BackButton onClick={() => go('master')} />
          </section>
        )}

        {/* ------------------------------------------------ step 4: details */}
        {step === 'details' && service && slot && (
          <section aria-labelledby="step-title">
            <StepTitle refEl={headingRef}>{t.booking.yourDetails}</StepTitle>
            <Summary
              rows={[
                [t.booking.service, `${service.name} (${formatDuration(service.durationMin)})`],
                [t.booking.master, master?.name ?? t.booking.anyMaster],
                [t.booking.date, formatDateWithWeekday(toRigaDate(new Date(slot.start)))],
                [t.booking.time, slot.time],
                [t.booking.price, service.priceLabel],
              ]}
              onEdit={() => go('time')}
            />

            <form className="mt-6 space-y-4" onSubmit={submit} noValidate>
              <Field
                id="bk-name"
                label={t.booking.name}
                error={touched.name && !nameOk ? t.booking.required : null}
              >
                <input
                  id="bk-name"
                  className="input"
                  autoComplete="name"
                  required
                  maxLength={100}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  onBlur={() => setTouched({ ...touched, name: true })}
                  aria-invalid={touched.name && !nameOk}
                />
              </Field>
              <Field
                id="bk-phone"
                label={t.booking.phone}
                hint={t.booking.phoneHint}
                error={touched.phone && !phoneOk ? (form.phone ? t.booking.invalidPhone : t.booking.required) : null}
              >
                <input
                  id="bk-phone"
                  className="input"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  required
                  maxLength={30}
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  onBlur={() => setTouched({ ...touched, phone: true })}
                  aria-invalid={touched.phone && !phoneOk}
                />
              </Field>
              <Field id="bk-email" label={t.booking.email} hint={t.booking.emailHint} error={touched.email && !emailOk ? t.booking.invalidEmail : null}>
                <input
                  id="bk-email"
                  className="input"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  maxLength={254}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  onBlur={() => setTouched({ ...touched, email: true })}
                  aria-invalid={touched.email && !emailOk}
                />
              </Field>
              <Field id="bk-comment" label={t.booking.comment} hint={t.booking.commentHint}>
                <textarea
                  id="bk-comment"
                  className="input min-h-24"
                  maxLength={1000}
                  value={form.comment}
                  onChange={(e) => setForm({ ...form, comment: e.target.value })}
                />
              </Field>
              {/* Honeypot: hidden from people and screen readers */}
              <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                <label htmlFor="bk-website">Mājaslapa</label>
                <input
                  id="bk-website"
                  tabIndex={-1}
                  autoComplete="off"
                  value={form.website}
                  onChange={(e) => setForm({ ...form, website: e.target.value })}
                />
              </div>

              {submitError && (
                <p className="alert-error" role="alert">
                  {submitError}
                </p>
              )}

              <p className="text-sm text-muted">{props.cancellationPolicy}</p>
              <button type="submit" className="btn-primary w-full text-lg sm:w-auto sm:px-10" disabled={submitting}>
                {submitting ? t.booking.submitting : t.booking.confirm}
              </button>
              <p className="text-xs text-muted">
                {t.booking.consent}{' '}
                <a href="/privatuma-politika" className="underline" target="_blank" rel="noopener">
                  {t.booking.privacyLink}
                </a>
                .
              </p>
            </form>
            <BackButton onClick={() => go('time')} />
          </section>
        )}

        {/* ------------------------------------------------ done */}
        {step === 'done' && result && (
          <section aria-labelledby="step-title" className="card p-6 text-center sm:p-10">
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <svg className="size-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <StepTitle refEl={headingRef} className="mt-4 text-center">
              {t.booking.successTitle}
            </StepTitle>
            <div className="mx-auto mt-6 max-w-md text-left">
              <Summary
                rows={[
                  [t.booking.service, result.serviceName],
                  [t.booking.master, result.masterName],
                  [t.booking.date, formatDateWithWeekday(toRigaDate(new Date(result.startsAt)))],
                  [t.booking.time, `${toRigaTime(new Date(result.startsAt))}–${toRigaTime(new Date(result.endsAt))}`],
                  ['Adrese', result.location],
                ]}
              />
            </div>
            <p className="mt-5 text-muted">
              {result.emailSent && result.email ? (
                <>
                  {t.booking.successEmail} <strong className="text-ink">{result.email}</strong>.
                </>
              ) : (
                t.booking.successNoEmail
              )}
            </p>
            <p className="mt-2 text-sm text-muted">{props.arrivalNote}</p>
            <CalendarLinks result={result} businessName={props.businessName} />
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <button type="button" className="btn-outline" onClick={restart}>
                {t.booking.newBooking}
              </button>
              <a href="/" className="btn-ghost">
                {t.booking.home}
              </a>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ pieces

function Progress({ index }: { index: number }) {
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Pieraksta soļi">
      {t.booking.steps.map((label, i) => (
        <li key={label} aria-current={i === index ? 'step' : undefined}>
          <span className={`block h-1.5 rounded-full ${i <= index ? 'bg-brand' : 'bg-line'}`} />
          <span className={`mt-1.5 block text-xs font-medium sm:text-sm ${i === index ? 'text-brand' : 'text-muted'}`}>
            {i + 1}. {label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function StepTitle({
  children,
  refEl,
  className = '',
}: {
  children: React.ReactNode;
  refEl: React.RefObject<HTMLHeadingElement | null>;
  className?: string;
}) {
  return (
    <h2 id="step-title" ref={refEl} tabIndex={-1} className={`scroll-mt-24 text-2xl font-semibold outline-none sm:text-3xl ${className}`}>
      {children}
    </h2>
  );
}

function Chosen({ service, masterName }: { service: WizardService; masterName?: string }) {
  return (
    <p className="mt-2 text-muted">
      {service.name} · {formatDuration(service.durationMin)} · {service.priceLabel}
      {masterName && <> · {masterName}</>}
    </p>
  );
}

function Summary({ rows, onEdit }: { rows: [string, string][]; onEdit?: () => void }) {
  return (
    <div className="card mt-4 p-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm sm:text-base">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      {onEdit && (
        <button type="button" onClick={onEdit} className="mt-3 text-sm font-medium text-brand underline">
          Mainīt laiku
        </button>
      )}
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children}
      {error ? <p className="error-text">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="btn-ghost mt-6 !px-3">
      ‹ {t.booking.back}
    </button>
  );
}

function Chevron() {
  return (
    <svg className="size-5 shrink-0 text-muted" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M7.2 14.8a1 1 0 010-1.4L10.6 10 7.2 6.6a1 1 0 111.4-1.4l4.1 4.1a1 1 0 010 1.4l-4.1 4.1a1 1 0 01-1.4 0z" clipRule="evenodd" />
    </svg>
  );
}

function CalendarLinks({ result, businessName }: { result: Result; businessName: string }) {
  const fmt = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const start = fmt(new Date(result.startsAt).toISOString());
  const end = fmt(new Date(result.endsAt).toISOString());
  const title = `${result.serviceName} – ${businessName}`;
  const google = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${start}/${end}&location=${encodeURIComponent(result.location)}&details=${encodeURIComponent(`Meistars: ${result.masterName}`)}`;

  function downloadIcs() {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//salon-booking//LV',
      'BEGIN:VEVENT',
      `UID:${start}-${Math.random().toString(36).slice(2)}@salon`,
      `DTSTAMP:${fmt(new Date().toISOString())}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${title}`,
      `LOCATION:${result.location.replace(/,/g, '\\,')}`,
      `DESCRIPTION:Meistars: ${result.masterName}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pieraksts.ics';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="mt-6">
      <p className="text-sm font-semibold">{t.booking.addToCalendar}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <a href={google} target="_blank" rel="noopener" className="btn-outline !min-h-9 !px-4 !py-1.5 text-sm">
          Google kalendārs
        </a>
        <button type="button" onClick={downloadIcs} className="btn-outline !min-h-9 !px-4 !py-1.5 text-sm">
          Apple / Outlook (.ics)
        </button>
      </div>
    </div>
  );
}
