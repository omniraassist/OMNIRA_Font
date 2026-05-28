import nodemailer from "nodemailer";

/**
 * Hostinger SMTP email service. Credentials come from env (SMTP_* — see
 * .env.example). Used to send subscription invoices/receipts from
 * ayuda@omnira.chat. Everything is best-effort: if SMTP isn't configured the
 * callers degrade gracefully instead of throwing.
 */
const HOST = String(process.env.SMTP_HOST || "").trim();
const PORT = Number(process.env.SMTP_PORT || 465);
const USER = String(process.env.SMTP_USER || "").trim();
const PASS = String(process.env.SMTP_PASS || "").trim();
const FROM = String(process.env.SMTP_FROM || USER || "").trim();
const DEFAULT_BCC = String(process.env.INVOICE_BCC || "").trim();

let _transporter = null;

export function isEmailConfigured() {
  return Boolean(HOST && USER && PASS);
}

/**
 * Per-variable presence (booleans only — never the secret values). Used by the
 * health endpoint so we can pinpoint exactly which SMTP_* var Vercel is missing.
 */
export function emailConfigDiagnostics() {
  return {
    SMTP_HOST: Boolean(HOST),
    SMTP_PORT: PORT || null,
    SMTP_USER: Boolean(USER),
    SMTP_PASS: Boolean(PASS),
    SMTP_FROM: Boolean(FROM),
    user_hint: USER ? `${USER.slice(0, 2)}***@${USER.split("@")[1] || ""}` : null,
  };
}

function getTransporter() {
  if (!isEmailConfigured()) return null;
  if (_transporter) return _transporter;
  _transporter = nodemailer.createTransport({
    host: HOST,
    port: PORT,
    secure: PORT === 465, // 465 = implicit SSL, 587 = STARTTLS
    auth: { user: USER, pass: PASS },
  });
  return _transporter;
}

function fromHeader() {
  if (!FROM) return USER;
  return FROM.includes("<") ? FROM : `Omnira <${FROM}>`;
}

/** Opens a connection and authenticates without sending — used by the health check. */
export async function verifyEmailTransport() {
  const t = getTransporter();
  if (!t) return { ok: false, message: "SMTP no configurado (define SMTP_HOST / SMTP_USER / SMTP_PASS)." };
  try {
    await t.verify();
    return { ok: true, message: "Conexión SMTP correcta." };
  } catch (e) {
    return { ok: false, message: e?.message || "Fallo al verificar SMTP" };
  }
}

export async function sendEmail({ to, subject, html, text, bcc, replyTo, attachments }) {
  const t = getTransporter();
  if (!t) throw new Error("El servidor no tiene el email configurado (faltan variables SMTP_*).");
  if (!to) throw new Error("Falta el destinatario (to).");
  const info = await t.sendMail({
    from: fromHeader(),
    to,
    bcc: bcc || DEFAULT_BCC || undefined,
    replyTo: replyTo || undefined,
    subject: subject || "(sin asunto)",
    html,
    text: text || undefined,
    attachments: attachments || undefined,
  });
  return { ok: true, messageId: info.messageId };
}
