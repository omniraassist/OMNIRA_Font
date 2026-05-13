/**
 * Platform settings (Meta + OpenAI runtime keys). Resolution order:
 *   1) public.platform_settings row (admin-editable in /whatsapp-config)
 *   2) process.env (Vercel-injected)
 *   3) caller's `fallback`
 *
 * The 30 s in-process cache keeps hot paths (webhook POST + OpenAI calls) cheap.
 * Admin PATCH calls invalidatePlatformSettingsCache() so edits go live in seconds.
 */
import { supabaseAdmin, isSupabaseConfigured } from "./config/supabase.js";

const TTL_MS = 30_000;
let _cache = null;
let _cacheAt = 0;

export function invalidatePlatformSettingsCache() {
  _cache = null;
  _cacheAt = 0;
}

async function loadDbMap() {
  if (!isSupabaseConfigured()) return {};
  try {
    const { data, error } = await supabaseAdmin.from("platform_settings").select("key, value");
    if (error) {
      console.warn("[platform_settings] read failed:", error.message);
      return {};
    }
    const map = {};
    for (const row of data || []) {
      if (row.value != null && String(row.value).trim() !== "") map[row.key] = String(row.value);
    }
    return map;
  } catch (e) {
    console.warn("[platform_settings] read crashed:", e?.message || e);
    return {};
  }
}

async function getMap() {
  if (_cache && Date.now() - _cacheAt < TTL_MS) return _cache;
  _cache = await loadDbMap();
  _cacheAt = Date.now();
  return _cache;
}

export async function getPlatformSetting(key, fallback = "") {
  const map = await getMap();
  if (map[key] != null && map[key] !== "") return map[key];
  const env = String(process.env[key] || "").trim();
  if (env) return env;
  return fallback;
}

/** Used by metaWhatsAppWebhook's GET diagnostics — quickly snapshot all keys. */
export async function snapshotPlatformSettings(keys) {
  const map = await getMap();
  const out = {};
  for (const k of keys) {
    const v = map[k] != null && map[k] !== "" ? map[k] : String(process.env[k] || "").trim();
    out[k] = v;
  }
  return out;
}

/** Reveal-safe: hides middle of a secret for GET endpoints. "abcd1234ef" -> "abcd…34ef" */
export function maskSecret(value) {
  const s = String(value || "");
  if (s.length <= 10) return s ? "•".repeat(s.length) : "";
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}
