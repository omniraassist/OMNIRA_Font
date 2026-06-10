/**
 * Provider registry. The rest of the system talks to this generic interface,
 * keeping sync.js and the route layer free of per-vendor branching:
 *
 *   const adapter = getAdapter('google');
 *   await adapter.createEvent(creds, calendarId, omniraEvent);
 *
 * Microsoft and Apple slot in here as Phase 2/3 adapters with the same shape.
 */
import * as google from "./googleCalendar.js";

const ADAPTERS = {
  google: {
    isConfigured: google.isGoogleCalendarConfigured,
    diagnostics: google.googleConfigDiagnostics,
    getAuthUrl: google.getAuthUrl,
    exchangeCode: google.exchangeCode,
    ensureFreshAccessToken: google.ensureFreshAccessToken,
    listCalendars: google.listCalendars,
    createEvent: google.createEvent,
    updateEvent: google.updateEvent,
    deleteEvent: google.deleteEvent,
    revokeToken: google.revokeToken,
  },
};

export function getAdapter(provider) {
  const a = ADAPTERS[provider];
  if (!a) throw new Error(`Calendar provider not supported: ${provider}`);
  return a;
}

export function listProviders() {
  return Object.keys(ADAPTERS);
}

export function providerStatus() {
  const out = {};
  for (const [name, a] of Object.entries(ADAPTERS)) {
    out[name] = { configured: a.isConfigured(), diagnostics: a.diagnostics() };
  }
  return out;
}
