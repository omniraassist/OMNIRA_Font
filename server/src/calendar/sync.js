/**
 * Outbound calendar sync orchestrator.
 *
 * The API path is fire-and-forget — the create/update/delete routes call
 * `syncEventOutbound(...)` after committing the OMNIRA event, and that:
 *   1. Enqueues a job per active connection (best-effort retry queue).
 *   2. Kicks a small in-process drain to attempt them immediately.
 * If the drain crashes, the cron-backed `runCalendarSyncJobs()` picks the
 * jobs up later with exponential backoff. The route never waits for the
 * external API — a slow Google response can never block a booking save.
 */
import { supabaseAdmin } from "../config/supabase.js";
import { decryptCredentials, encryptCredentials } from "./crypto.js";
import { getAdapter } from "./registry.js";

const MAX_ATTEMPTS = 6;          // ~6 retries with exponential backoff
const DRAIN_BATCH = 25;          // per drain invocation

function nextBackoffMs(attempt) {
  // 30s, 2m, 8m, 30m, 2h, 8h — sane for serverless cron.
  return Math.min(8 * 3600 * 1000, 30_000 * Math.pow(4, attempt));
}

/**
 * Enqueue sync jobs for every active connection a customer has, then trigger
 * a non-blocking drain. Safe to call from any event mutation route.
 *
 *   op:     'create' | 'update' | 'delete'
 *   event:  the OMNIRA event row that was just written (for delete: the row's
 *           id is enough — the worker looks up external_refs).
 */
export async function syncEventOutbound({ customerId, op, event }) {
  try {
    if (!customerId || !op || !event?.id) return { ok: false, reason: "bad-args" };

    const { data: conns } = await supabaseAdmin
      .from("customer_calendar_connections")
      .select("id, provider, target_calendar_id")
      .eq("customer_user_id", customerId)
      .eq("status", "active");

    if (!conns?.length) return { ok: true, enqueued: 0 };

    // For delete, capture the external refs in the payload BEFORE the OMNIRA
    // event row vanishes from the DB.
    let externalSnapshot = {};
    if (op === "delete") {
      const { data: refs } = await supabaseAdmin
        .from("customer_event_external_refs")
        .select("connection_id, external_event_id")
        .eq("omnira_event_id", event.id)
        .eq("direction", "outbound");
      for (const r of refs || []) {
        externalSnapshot[r.connection_id] = r.external_event_id;
      }
    }

    const rows = conns.map((c) => ({
      connection_id: c.id,
      op,
      payload: {
        event,
        externalEventId: externalSnapshot[c.id] || null,
      },
    }));

    await supabaseAdmin.from("calendar_sync_jobs").insert(rows);

    // Fire-and-forget drain — we don't await it.
    runCalendarSyncJobs().catch((e) => {
      // eslint-disable-next-line no-console
      console.warn("[calendar sync] post-enqueue drain failed:", e?.message || e);
    });

    return { ok: true, enqueued: rows.length };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[calendar sync] enqueue failed:", e?.message || e);
    return { ok: false, reason: e?.message || "enqueue-failed" };
  }
}

/**
 * Drain due jobs. Safe to call concurrently — Supabase doesn't have row locks
 * available to us directly, but each job marks itself in-progress via an
 * attempts++ update; in the worst case a duplicate Google API call happens
 * and the second one 409s (handled below).
 */
export async function runCalendarSyncJobs() {
  const nowIso = new Date().toISOString();
  const { data: jobs } = await supabaseAdmin
    .from("calendar_sync_jobs")
    .select("id, connection_id, op, payload, attempts")
    .eq("status", "pending")
    .lte("next_attempt_at", nowIso)
    .order("next_attempt_at", { ascending: true })
    .limit(DRAIN_BATCH);

  if (!jobs?.length) return { processed: 0 };

  let done = 0;
  for (const job of jobs) {
    try {
      await processJob(job);
      await supabaseAdmin
        .from("calendar_sync_jobs")
        .update({ status: "done", updated_at: new Date().toISOString() })
        .eq("id", job.id);
      done += 1;
    } catch (e) {
      const attempts = (job.attempts || 0) + 1;
      const isFatal = attempts >= MAX_ATTEMPTS;
      await supabaseAdmin
        .from("calendar_sync_jobs")
        .update({
          attempts,
          status: isFatal ? "failed" : "pending",
          next_attempt_at: new Date(Date.now() + nextBackoffMs(attempts)).toISOString(),
          last_error: String(e?.message || e).slice(0, 800),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
    }
  }
  return { processed: jobs.length, done };
}

async function processJob(job) {
  const { data: conn } = await supabaseAdmin
    .from("customer_calendar_connections")
    .select("id, customer_user_id, provider, encrypted_credentials, target_calendar_id, status")
    .eq("id", job.connection_id)
    .maybeSingle();

  if (!conn) throw new Error(`Connection ${job.connection_id} not found`);
  if (conn.status !== "active") throw new Error(`Connection status is ${conn.status}`);

  const adapter = getAdapter(conn.provider);
  let creds = decryptCredentials(conn.encrypted_credentials);

  // Refresh access token if it's near expiry. Persist the new token if rotated.
  const { creds: fresh, changed } = await adapter.ensureFreshAccessToken(creds);
  creds = fresh;
  if (changed) {
    await supabaseAdmin
      .from("customer_calendar_connections")
      .update({
        encrypted_credentials: encryptCredentials(creds),
        token_expires_at: creds.expiry ? new Date(creds.expiry).toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conn.id);
  }

  const ev = job.payload?.event || {};
  const calendarId = conn.target_calendar_id || "primary";

  if (job.op === "create") {
    const res = await adapter.createEvent(creds, calendarId, ev);
    await supabaseAdmin.from("customer_event_external_refs").upsert(
      {
        omnira_event_id: ev.id,
        connection_id: conn.id,
        provider: conn.provider,
        external_event_id: res.externalId,
        external_etag: res.etag || null,
        external_ical_uid: res.iCalUID || null,
        direction: "outbound",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "connection_id,external_event_id" }
    );
    return;
  }

  if (job.op === "update") {
    // Find the external id for this connection.
    const { data: refRow } = await supabaseAdmin
      .from("customer_event_external_refs")
      .select("external_event_id")
      .eq("omnira_event_id", ev.id)
      .eq("connection_id", conn.id)
      .eq("direction", "outbound")
      .maybeSingle();

    if (!refRow?.external_event_id) {
      // We never created it externally (maybe sync was added later) — create now.
      const res = await adapter.createEvent(creds, calendarId, ev);
      await supabaseAdmin.from("customer_event_external_refs").upsert(
        {
          omnira_event_id: ev.id,
          connection_id: conn.id,
          provider: conn.provider,
          external_event_id: res.externalId,
          external_etag: res.etag || null,
          external_ical_uid: res.iCalUID || null,
          direction: "outbound",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "connection_id,external_event_id" }
      );
      return;
    }
    const res = await adapter.updateEvent(creds, calendarId, refRow.external_event_id, ev);
    await supabaseAdmin
      .from("customer_event_external_refs")
      .update({ external_etag: res.etag || null, updated_at: new Date().toISOString() })
      .eq("connection_id", conn.id)
      .eq("external_event_id", refRow.external_event_id);
    return;
  }

  if (job.op === "delete") {
    const externalId = job.payload?.externalEventId;
    if (!externalId) return; // nothing to delete
    try {
      await adapter.deleteEvent(creds, calendarId, externalId);
    } catch (e) {
      // 404/410 means already gone — that's success.
      if (e?.status === 404 || e?.status === 410) {
        // ignore
      } else {
        throw e;
      }
    }
    await supabaseAdmin
      .from("customer_event_external_refs")
      .delete()
      .eq("connection_id", conn.id)
      .eq("external_event_id", externalId);
    return;
  }

  throw new Error(`Unknown op: ${job.op}`);
}
