import jwt from "jsonwebtoken";

function secret() {
  const s = String(process.env.CUSTOMER_JWT_SECRET || "").trim();
  if (s) return s;
  if (process.env.VERCEL) {
    console.warn("CUSTOMER_JWT_SECRET missing on Vercel — set it in Environment Variables.");
  }
  return "omnira-dev-insecure-jwt-secret-change-me";
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
