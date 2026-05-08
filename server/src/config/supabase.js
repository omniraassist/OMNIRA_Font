import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in server/.env"
  );
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

export async function testSupabaseConnection() {
  const { error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (error) {
    throw new Error(`Supabase connection failed: ${error.message}`);
  }
  return "Supabase connected successfully.";
}
