import "../load-env.js";
import { createClient } from "@supabase/supabase-js";

function resolveUrl() {
  return String(process.env.SUPABASE_URL || "")
    .trim()
    .replace(/^\uFEFF/, "");
}

/** Supabase dashboard / Vercel may use different env names for the service key. */
function resolveServiceKey() {
  const names = ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_KEY"];
  for (const n of names) {
    const v = String(process.env[n] || "")
      .trim()
      .replace(/^\uFEFF/, "");
    if (v) return v;
  }
  return "";
}

let _client = null;

function buildClient() {
  const supabaseUrl = resolveUrl();
  const serviceRoleKey = resolveServiceKey();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase is not configured. In Vercel → Project → Settings → Environment Variables, set SUPABASE_URL and " +
        "SUPABASE_SERVICE_ROLE_KEY (JWT service_role). If you only have SUPABASE_SECRET_KEY (sb_secret_…), add it as " +
        "SUPABASE_SERVICE_ROLE_KEY or set SUPABASE_SECRET_KEY — this server reads both names."
    );
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

function getClient() {
  if (!_client) {
    _client = buildClient();
  }
  return _client;
}

/** True when URL + service key are present (does not verify network). */
export function isSupabaseConfigured() {
  return Boolean(resolveUrl() && resolveServiceKey());
}

/**
 * Lazily creates the client on first use so the module can load on Vercel even if
 * env is temporarily wrong during cold start diagnostics — failing requests return 500 JSON instead of crashing the function.
 */
export const supabaseAdmin = new Proxy(
  {},
  {
    get(_target, prop, _receiver) {
      const client = getClient();
      const value = Reflect.get(client, prop, client);
      return typeof value === "function" ? value.bind(client) : value;
    }
  }
);

export async function testSupabaseConnection() {
  const { error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (error) {
    throw new Error(`Supabase connection failed: ${error.message}`);
  }
  return "Supabase connected successfully.";
}
