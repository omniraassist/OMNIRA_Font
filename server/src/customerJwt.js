import jwt from "jsonwebtoken";

const FALLBACK_DEV_SECRET = "omnira-dev-insecure-jwt-secret-change-me";

function secret() {
  const s = String(process.env.CUSTOMER_JWT_SECRET || "").trim();
  if (s) return s;
  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    console.error("[FATAL] CUSTOMER_JWT_SECRET is not set in production. Tokens are insecure.");
  }
  return FALLBACK_DEV_SECRET;
}

function adminSecret() {
  const s = String(process.env.ADMIN_JWT_SECRET || process.env.CUSTOMER_JWT_SECRET || "").trim();
  if (s) return s;
  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    console.error("[FATAL] ADMIN_JWT_SECRET is not set in production. Admin tokens are insecure.");
  }
  return `admin-${FALLBACK_DEV_SECRET}`;
}

export function signCustomerToken(userId, email) {
  return jwt.sign({ sub: userId, email: String(email || "").toLowerCase() }, secret(), {
    expiresIn: "60d"
  });
}

export function verifyCustomerToken(token) {
  return jwt.verify(String(token || ""), secret());
}

export function requireCustomer(req, res, next) {
  const auth = req.headers.authorization;
  const raw = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (!raw) {
    return res.status(401).json({ ok: false, message: "Authorization required." });
  }
  try {
    const p = verifyCustomerToken(raw);
    req.customerId = p.sub;
    req.customerEmail = p.email;
    return next();
  } catch {
    return res.status(401).json({ ok: false, message: "Invalid or expired session." });
  }
}

// ---------------------------------------------------------------------------
// Admin JWT
// ---------------------------------------------------------------------------

export function signAdminToken(adminId, email) {
  return jwt.sign(
    { sub: adminId, email: String(email || "").toLowerCase(), role: "admin" },
    adminSecret(),
    { expiresIn: "12h" }
  );
}

export function verifyAdminToken(token) {
  const p = jwt.verify(String(token || ""), adminSecret());
  if (p?.role !== "admin") throw new Error("not_admin");
  return p;
}

export function requireAdmin(req, res, next) {
  const auth = req.headers.authorization;
  const raw = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (!raw) {
    return res.status(401).json({ ok: false, message: "Admin authorization required." });
  }
  try {
    const p = verifyAdminToken(raw);
    req.adminId = p.sub;
    req.adminEmail = p.email;
    return next();
  } catch {
    return res.status(401).json({ ok: false, message: "Invalid or expired admin session." });
  }
}
