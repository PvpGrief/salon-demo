/**
 * Loads everything the slot calculation needs and turns database rows into
 * the shapes used by ./slots.ts. Works with any Supabase client (anon key is
 * enough – only public data and get_public_schedule() are used).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays, rigaToUtc } from '../time';
import type { BusyInterval, SlotSettings, WorkingInterval } from './slots';

export interface ServiceRow {
  id: string;
  name: string;
  description: string;
  category: string;
  duration_min: number;
  price_eur: number | string | null;
  price_from: boolean;
  active: boolean;
  sort_order: number;
}

export interface MasterRow {
  id: string;
  name: string;
  title: string;
  bio: string;
  photo_url: string | null;
  active: boolean;
  sort_order: number;
}

export interface SettingsRow {
  slot_step_min: number;
  buffer_min: number;
  min_notice_min: number;
  max_days_ahead: number;
  cancel_hours: number;
  max_active_per_phone: number;
  retention_months: number;
}

export interface Catalogue {
  services: ServiceRow[];
  masters: MasterRow[];
  /** master id → service ids */
  masterServices: Map<string, Set<string>>;
  workingHours: WorkingInterval[];
  closedDays: Map<string, string>;
  settings: SettingsRow;
}

export function toWorkingIntervals(
  rows: { master_id: string; weekday: number; start_time: string; end_time: string }[],
): WorkingInterval[] {
  return rows.map((r) => ({
    masterId: r.master_id,
    weekday: Number(r.weekday),
    start: r.start_time.slice(0, 5),
    end: r.end_time.slice(0, 5),
  }));
}

export function toBusyIntervals(
  rows: { master_id: string; starts_at: string | Date; ends_at: string | Date; kind: string }[],
): BusyInterval[] {
  return rows.map((r) => ({
    masterId: r.master_id,
    start: new Date(r.starts_at),
    end: new Date(r.ends_at),
    kind: r.kind === 'blocked' ? 'blocked' : 'booked',
  }));
}

export function toSlotSettings(s: SettingsRow): SlotSettings {
  return {
    slotStepMin: s.slot_step_min,
    bufferMin: s.buffer_min,
    minNoticeMin: s.min_notice_min,
    maxDaysAhead: s.max_days_ahead,
  };
}

function dateKey(value: string | Date): string {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

/** Services, masters, hours, closed days and settings (public data). */
export async function loadCatalogue(supabase: SupabaseClient): Promise<Catalogue> {
  const [services, masters, ms, wh, closed, settings] = await Promise.all([
    supabase.from('services').select('*').eq('active', true).order('sort_order').order('name'),
    supabase.from('masters').select('*').eq('active', true).order('sort_order').order('name'),
    supabase.from('master_services').select('master_id, service_id'),
    supabase.from('working_hours').select('master_id, weekday, start_time, end_time').order('start_time'),
    supabase.from('closed_days').select('day, reason').order('day'),
    supabase.from('settings').select('*').eq('id', 1).single(),
  ]);

  for (const r of [services, masters, ms, wh, closed, settings]) {
    if (r.error) throw new Error(`Supabase: ${r.error.message}`);
  }

  const masterServices = new Map<string, Set<string>>();
  for (const row of ms.data ?? []) {
    if (!masterServices.has(row.master_id)) masterServices.set(row.master_id, new Set());
    masterServices.get(row.master_id)!.add(row.service_id);
  }

  return {
    services: (services.data ?? []) as ServiceRow[],
    masters: (masters.data ?? []) as MasterRow[],
    masterServices,
    workingHours: toWorkingIntervals(wh.data ?? []),
    closedDays: new Map((closed.data ?? []).map((c) => [dateKey(c.day), c.reason as string])),
    settings: settings.data as SettingsRow,
  };
}

/** Busy intervals (bookings + blocks) touching the local dates [fromDate, fromDate + days). */
export async function loadBusy(supabase: SupabaseClient, fromDate: string, days: number): Promise<BusyInterval[]> {
  const { data, error } = await supabase.rpc('get_public_schedule', {
    p_from: rigaToUtc(fromDate, '00:00').toISOString(),
    p_to: rigaToUtc(addDays(fromDate, days), '00:00').toISOString(),
  });
  if (error) throw new Error(`Supabase: ${error.message}`);
  return toBusyIntervals(data ?? []);
}

/** Active masters offering a service, in display order. */
export function mastersForService(cat: Catalogue, serviceId: string): MasterRow[] {
  return cat.masters.filter((m) => cat.masterServices.get(m.id)?.has(serviceId));
}
