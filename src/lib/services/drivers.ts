import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { EventDriver } from "@/types";

/** A member declared as a driver for an event, as shown on the event plan. */
export interface EventDriverEntry {
  userId: string;
  /** `null` only if the driver's profile is not visible, which RLS should not allow for a member. */
  nick: string | null;
  phone: string | null;
  seats: number;
}

export type DriverWriteFailure = "forbidden" | "invalid_seats" | "unknown";

export type DriverWriteResult = { ok: true } | { ok: false; failure: DriverWriteFailure; error?: PostgrestError };

export type DriverWithdrawResult =
  /** `deleted: false` means RLS matched no row: no declaration, a started event or not a member. */
  { ok: true; deleted: boolean } | { ok: false; failure: "unknown"; error: PostgrestError };

/** The event's seat balance: going children against declared seats. */
export interface SeatBalance {
  going: number;
  seats: number;
  /** Seats still needed; 0 unless `status` is `shortage`. */
  missing: number;
  status: "none_going" | "enough" | "shortage";
}

// No generated DB types: query results are read through this shape via `unknown`.
type DriverRow = Pick<EventDriver, "user_id" | "seats"> & { profiles: { nick: string; phone: string | null } | null };

/** The event's drivers with nick and phone, ordered by nick. RLS limits rows to members of its group. */
export async function listEventDrivers(supabase: SupabaseClient, eventId: string): Promise<EventDriverEntry[]> {
  const { data, error } = await supabase
    .from("event_drivers")
    .select("user_id, seats, profiles(nick, phone)")
    .eq("event_id", eventId);
  if (error) {
    throw new Error(`listEventDrivers failed: ${error.message}`);
  }
  const rows = (data as unknown as DriverRow[] | null) ?? [];
  return rows
    .map((row) => ({
      userId: row.user_id,
      nick: row.profiles?.nick ?? null,
      phone: row.profiles?.phone ?? null,
      seats: row.seats,
    }))
    .sort((a, b) => (a.nick ?? "").localeCompare(b.nick ?? "", "pl"));
}

/**
 * Maps the `set_event_driver` RPC error. The RPC raises 42501 for a foreign or invisible event and
 * one that already started; seats outside 1-8 break the table's check (23514).
 */
export function driverWriteResult(error: PostgrestError | null): DriverWriteResult {
  if (error) {
    if (error.code === "42501") return { ok: false, failure: "forbidden", error };
    if (error.code === "23514") return { ok: false, failure: "invalid_seats", error };
    return { ok: false, failure: "unknown", error };
  }
  return { ok: true };
}

/**
 * Declares the signed-in member a driver with `seats`, or changes the seats of their declaration.
 * Writes only through the `set_event_driver` RPC: a PostgREST upsert would need UPDATE on the key
 * columns, which is not granted. Error codes are mapped by `driverWriteResult`.
 */
export async function setEventDriver(
  supabase: SupabaseClient,
  { eventId, seats }: { eventId: string; seats: number },
): Promise<DriverWriteResult> {
  const { error } = await supabase.rpc("set_event_driver", { p_event_id: eventId, p_seats: seats });
  return driverWriteResult(error);
}

/**
 * Withdraws the member's driver declaration. DELETE under RLS does not raise: a started event or a
 * non-member simply matches 0 rows, so the deleted rows are selected and reported as `deleted`.
 */
export async function withdrawEventDriver(
  supabase: SupabaseClient,
  { eventId, userId }: { eventId: string; userId: string },
): Promise<DriverWithdrawResult> {
  const { data, error } = await supabase
    .from("event_drivers")
    .delete()
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .select("event_id");
  if (error) return { ok: false, failure: "unknown", error };
  return { ok: true, deleted: data.length > 0 };
}

/**
 * The seat balance for `goingCount` children declared as going (children without a declaration do
 * not count) against the sum of the drivers' seats.
 */
export function buildSeatBalance(drivers: Pick<EventDriverEntry, "seats">[], goingCount: number): SeatBalance {
  const seats = drivers.reduce((sum, driver) => sum + driver.seats, 0);
  const missing = Math.max(0, goingCount - seats);
  const status = goingCount === 0 ? "none_going" : seats < goingCount ? "shortage" : "enough";
  return { going: goingCount, seats, missing, status };
}
