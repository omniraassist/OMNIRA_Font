/**
 * Google Calendar adapter (OAuth 2.0 + Calendar API v3).
 *
 * No SDK — raw fetch keeps the bundle tiny and the surface area honest.
 * Everything is shaped around the provider contract used by sync.js:
 *
 *   isConfigured()       -> bool
 *   getAuthUrl(state)    -> https://accounts.google.com/...
 *   exchangeCode(code)   -> { access_token, refresh_token, expiry, email, scope }
 *   refreshTokens(creds) -> { access_token, expiry } (refresh_token reused)
 *   createEvent(creds, calendarId, omniraEvent) -> { externalId, etag, iCalUID }
 *   updateEvent(creds, calendarId, externalId, omniraEvent) -> { etag }
 *   deleteEvent(creds, calendarId, externalId)  -> { ok }
 *   listCalendars(creds)                        -> [{id, summary, primary, ...}]
 *
 * Phase 2 will add: freeBusy() for availability and watch() for push
 * notifications. The schema already has the columns ready for both.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const API_BASE = "https://www.googleapis.com/calendar/v3";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

// Minimum scopes for one-way push + later reads.
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
].join(" ");

function clientId() { return String(process.env.GOOGLE_OAUTH_CLIENT_ID || "").trim(); }
function clientSecret() { return String(process.env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim(); }
function redirectUri() { return String(process.env.GOOGLE_OAUTH_REDIRECT_URI || "").trim(); }

export function isGoogleCalendarConfigured() {
  return Boolean(clientId() && clientSecret() && redirectUri());
}

export function googleConfigDiagnostics() {
  return {
    GOOGLE_OAUTH_CLIENT_ID: Boolean(clientId()),
    GOOGLE_OAUTH_CLIENT_SECRET: Boolean(clientSecret()),
    GOOGLE_OAUTH_REDIRECT_URI: redirectUri() || null,
  };
}

export function getAuthUrl(state) {
  if (!isGoogleCalendarConfigured()) {
    throw new Error("Google OAuth no configurado en el servidor.");
  }
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function postForm(url, params) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const txt = await r.text();
  let json = {};
  try { json = txt ? JSON.parse(txt) : {}; } catch { /* leave empty */ }
  if (!r.ok) {
    const msg = json.error_description || json.error || `HTTP ${r.status}`;
    throw new Error(`Google token endpoint: ${msg}`);
  }
  return json;
}

async function decodeIdTokenEmail(idToken) {
  if (typeof idToken !== "string" || !idToken.includes(".")) return null;
  try {
    const payload = idToken.split(".")[1];
    const json = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
    return json.email || null;
  } catch {
    return null;
  }
}

export async function exchangeCode(code) {
  const tok = await postForm(TOKEN_URL, {
    code,
    client_id: clientId(),
    client_secret: clientSecret(),
    redirect_uri: redirectUri(),
    grant_type: "authorization_code",
  });
  const email = await decodeIdTokenEmail(tok.id_token);
  return {
    access_token: tok.access_token,
    refresh_token: tok.refresh_token || null,
    scope: tok.scope || SCOPES,
    token_type: tok.token_type || "Bearer",
    expiry: Date.now() + Math.max(0, Number(tok.expires_in || 3600) - 60) * 1000,
    email,
  };
}

export async function refreshTokens(creds) {
  if (!creds?.refresh_token) {
    throw new Error("No hay refresh_token disponible — pide al usuario que reconecte.");
  }
  const tok = await postForm(TOKEN_URL, {
    client_id: clientId(),
    client_secret: clientSecret(),
    refresh_token: creds.refresh_token,
    grant_type: "refresh_token",
  });
  return {
    access_token: tok.access_token,
    refresh_token: creds.refresh_token, // Google rarely rotates refresh tokens
    scope: tok.scope || creds.scope,
    token_type: tok.token_type || "Bearer",
    expiry: Date.now() + Math.max(0, Number(tok.expires_in || 3600) - 60) * 1000,
  };
}

/**
 * If the access token is within the safety window of expiry, refresh it. Returns
 * the credentials object you should persist (caller writes it back if changed).
 */
export async function ensureFreshAccessToken(creds) {
  const expiry = Number(creds?.expiry || 0);
  if (expiry && expiry - 60_000 > Date.now()) return { creds, changed: false };
  if (!creds?.refresh_token) return { creds, changed: false }; // can't refresh without a refresh_token
  const next = await refreshTokens(creds);
  return { creds: next, changed: true };
}

async function apiCall(path, { method = "GET", token, body } = {}) {
  const r = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text();
  let json = {};
  try { json = txt ? JSON.parse(txt) : {}; } catch { /* leave empty */ }
  if (!r.ok) {
    const msg = json?.error?.message || `HTTP ${r.status}`;
    const err = new Error(`Google Calendar API: ${msg}`);
    err.status = r.status;
    err.payload = json;
    throw err;
  }
  return json;
}

export async function listCalendars(creds) {
  const data = await apiCall("/users/me/calendarList?minAccessRole=writer&showHidden=false", { token: creds.access_token });
  return (data.items || []).map((c) => ({
    id: c.id,
    summary: c.summary,
    primary: !!c.primary,
    timeZone: c.timeZone,
    accessRole: c.accessRole,
  }));
}

/**
 * Convert an OMNIRA event into a Google Calendar event resource. We stamp the
 * OMNIRA event id into extendedProperties.private.omniraEventId so the future
 * inbound importer can recognise our own events and skip them.
 */
function toGoogleEvent(ev) {
  const start = new Date(ev.datetime);
  const end = ev.end_at
    ? new Date(ev.end_at)
    : new Date(start.getTime() + 60 * 60 * 1000); // default 60-minute window
  const summary = ev.name ? `${ev.name}${ev.service ? ` — ${ev.service}` : ""}` : ev.service || "Reserva Omnira";
  const descLines = [];
  if (ev.service) descLines.push(`Servicio: ${ev.service}`);
  if (ev.phone) descLines.push(`Teléfono: ${ev.phone}`);
  if (ev.notes) descLines.push(ev.notes);
  descLines.push("");
  descLines.push("— Reserva creada por Omnira");
  return {
    summary,
    description: descLines.join("\n"),
    start: { dateTime: start.toISOString(), timeZone: "Europe/Madrid" },
    end:   { dateTime: end.toISOString(),   timeZone: "Europe/Madrid" },
    source: { title: "Omnira", url: "https://omnira.chat" },
    extendedProperties: {
      private: { omniraEventId: String(ev.id || "") },
    },
  };
}

export async function createEvent(creds, calendarId, omniraEvent) {
  const data = await apiCall(`/calendars/${encodeURIComponent(calendarId || "primary")}/events`, {
    method: "POST",
    token: creds.access_token,
    body: toGoogleEvent(omniraEvent),
  });
  return {
    externalId: data.id,
    etag: data.etag,
    iCalUID: data.iCalUID || null,
    htmlLink: data.htmlLink || null,
  };
}

export async function updateEvent(creds, calendarId, externalId, omniraEvent) {
  const data = await apiCall(
    `/calendars/${encodeURIComponent(calendarId || "primary")}/events/${encodeURIComponent(externalId)}`,
    { method: "PUT", token: creds.access_token, body: toGoogleEvent(omniraEvent) }
  );
  return { etag: data.etag };
}

export async function deleteEvent(creds, calendarId, externalId) {
  // Google returns 204 No Content on success — apiCall handles non-OK.
  await apiCall(
    `/calendars/${encodeURIComponent(calendarId || "primary")}/events/${encodeURIComponent(externalId)}`,
    { method: "DELETE", token: creds.access_token }
  );
  return { ok: true };
}

export async function revokeToken(creds) {
  if (!creds?.refresh_token && !creds?.access_token) return { ok: false };
  try {
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(creds.refresh_token || creds.access_token)}`, { method: "POST" });
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e?.message || "revoke failed" };
  }
}
