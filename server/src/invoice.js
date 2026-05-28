import { supabaseAdmin } from "./config/supabase.js";
import { getCheckoutPlan } from "./billing.js";
import { sendEmail, isEmailConfigured } from "./email.js";

const BRAND = {
  name: "Omnira",
  email: "ayuda@omnira.chat",
  site: "omnira.chat",
  green: "#00e5a0",
  green2: "#00c87a",
  ink: "#0b1220",
};

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function eur(cents, currency = "eur") {
  const n = Number(cents || 0) / 100;
  const symbol = String(currency).toLowerCase() === "eur" ? "€" : `${String(currency).toUpperCase()} `;
  return `${symbol}${n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function monthsFromDays(days) {
  return Math.max(1, Math.round(Number(days || 30) / 30));
}

function fmtDate(value) {
  try {
    return new Date(value).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return "";
  }
}

/** Deterministic, human-friendly invoice number from a payment row. */
export function invoiceNumberFor(payment) {
  const id = String(payment?.id || payment?.stripe_payment_intent_id || payment?.stripe_checkout_session_id || "");
  const year = (() => {
    try {
      return new Date(payment?.created_at || Date.now()).getUTCFullYear();
    } catch {
      return "";
    }
  })();
  const tail = id.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase() || "000000";
  return `OMN-${year}-${tail}`;
}

/**
 * Normalize a payment + user (+ plan) into the fields the template needs.
 */
export function buildInvoiceData({ payment, user, planLabel }) {
  const months = monthsFromDays(payment.period_days);
  const customerName =
    `${user?.first_name || ""} ${user?.last_name || ""}`.trim() ||
    (user?.email ? user.email.split("@")[0] : "Cliente");
  return {
    number: invoiceNumberFor(payment),
    issueDate: fmtDate(payment.created_at),
    customerName,
    customerEmail: user?.email || "",
    planLabel: planLabel || payment.plan_id || "Suscripción",
    months,
    periodText: months === 1 ? "1 mes" : `${months} meses`,
    amountCents: Number(payment.amount_cents || 0),
    currency: payment.currency || "eur",
    paymentRef: payment.stripe_payment_intent_id || payment.stripe_checkout_session_id || "",
    subscriptionEnd: fmtDate(payment.subscription_end_after),
  };
}

/**
 * A full, print-ready A4 colorful invoice document. Used as the email body and
 * for the admin preview (rendered inside an iframe). Inline styles keep it
 * legible across email clients; the <style> block adds print/page rules.
 */
export function renderInvoiceHtml(inv) {
  const total = eur(inv.amountCents, inv.currency);
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Factura ${escapeHtml(inv.number)} · Omnira</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #eef2f7; font-family: 'Helvetica Neue', Arial, 'Segoe UI', sans-serif; color: #0b1220; }
  .sheet { width: 210mm; min-height: 297mm; margin: 16px auto; background: #fff; box-shadow: 0 10px 40px rgba(15,23,42,0.12); overflow: hidden; }
  @media print { body { background: #fff; } .sheet { margin: 0; box-shadow: none; } @page { size: A4; margin: 0; } }
  @media (max-width: 760px) { .sheet { width: auto; margin: 0; } }
</style>
</head>
<body>
  <div class="sheet">
    <!-- HEADER BAND -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:linear-gradient(135deg,#00e5a0 0%,#00c87a 55%,#0aa6c2 100%);">
      <tr>
        <td style="padding:34px 40px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr>
              <td style="vertical-align:middle;">
                <div style="font-size:30px;font-weight:800;letter-spacing:-0.5px;color:#04201a;font-family:'Syne',Arial,sans-serif;">Omnira</div>
                <div style="font-size:12px;color:#053a2e;opacity:0.85;margin-top:3px;letter-spacing:1px;text-transform:uppercase;">Asistente de WhatsApp con IA</div>
              </td>
              <td style="vertical-align:middle;text-align:right;">
                <div style="font-size:34px;font-weight:800;letter-spacing:6px;color:#04201a;font-family:'Syne',Arial,sans-serif;">FACTURA</div>
                <div style="font-size:13px;color:#053a2e;margin-top:6px;">Nº <strong>${escapeHtml(inv.number)}</strong></div>
                <div style="font-size:13px;color:#053a2e;">Fecha: <strong>${escapeHtml(inv.issueDate)}</strong></div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- PAID RIBBON -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#04201a;">
      <tr>
        <td style="padding:10px 40px;color:#7CF3CE;font-size:12px;letter-spacing:2px;text-transform:uppercase;font-weight:700;">
          ● Pagado &nbsp;·&nbsp; Gracias por tu compra
        </td>
        <td style="padding:10px 40px;text-align:right;color:#9fb3c8;font-size:12px;">
          ${escapeHtml(BRAND.site)} &nbsp;·&nbsp; ${escapeHtml(BRAND.email)}
        </td>
      </tr>
    </table>

    <!-- FROM / TO -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr>
        <td style="width:50%;padding:28px 40px 8px;vertical-align:top;">
          <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#64748b;font-weight:700;margin-bottom:6px;">De</div>
          <div style="font-size:15px;font-weight:700;color:#0b1220;">Omnira</div>
          <div style="font-size:13px;color:#475569;line-height:1.7;margin-top:2px;">
            Plataforma SaaS · WhatsApp Business AI<br/>
            ${escapeHtml(BRAND.email)}<br/>
            ${escapeHtml(BRAND.site)}
          </div>
        </td>
        <td style="width:50%;padding:28px 40px 8px;vertical-align:top;">
          <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#64748b;font-weight:700;margin-bottom:6px;">Facturar a</div>
          <div style="font-size:15px;font-weight:700;color:#0b1220;">${escapeHtml(inv.customerName)}</div>
          <div style="font-size:13px;color:#475569;line-height:1.7;margin-top:2px;">
            ${escapeHtml(inv.customerEmail)}
          </div>
        </td>
      </tr>
    </table>

    <!-- SUMMARY STRIP -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:18px 40px 0;width:calc(100% - 80px);background:#f0fdf8;border:1px solid #b6f0db;border-left:4px solid #00c87a;border-radius:10px;">
      <tr>
        <td style="padding:14px 18px;font-size:12px;color:#475569;">Factura<br/><strong style="color:#0b1220;font-size:14px;">${escapeHtml(inv.number)}</strong></td>
        <td style="padding:14px 18px;font-size:12px;color:#475569;">Fecha de emisión<br/><strong style="color:#0b1220;font-size:14px;">${escapeHtml(inv.issueDate)}</strong></td>
        <td style="padding:14px 18px;font-size:12px;color:#475569;">Estado<br/><strong style="color:#00a06a;font-size:14px;">PAGADO</strong></td>
        <td style="padding:14px 18px;font-size:12px;color:#475569;">Total<br/><strong style="color:#0b1220;font-size:14px;">${escapeHtml(total)}</strong></td>
      </tr>
    </table>

    <!-- LINE ITEMS -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:24px 40px 0;width:calc(100% - 80px);">
      <thead>
        <tr style="background:#0b1220;">
          <th style="text-align:left;padding:12px 16px;color:#fff;font-size:11px;letter-spacing:1px;text-transform:uppercase;border-radius:8px 0 0 8px;">Descripción</th>
          <th style="text-align:center;padding:12px 16px;color:#fff;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Periodo</th>
          <th style="text-align:right;padding:12px 16px;color:#fff;font-size:11px;letter-spacing:1px;text-transform:uppercase;border-radius:0 8px 8px 0;">Importe</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="padding:16px;border-bottom:1px solid #e2e8f0;font-size:14px;">
            <strong style="display:block;color:#0b1220;">Suscripción Omnira — ${escapeHtml(inv.planLabel)}</strong>
            <span style="font-size:12px;color:#64748b;">Agente de WhatsApp con IA · Respuestas 24/7 · Reservas automáticas · Panel completo</span>
          </td>
          <td style="padding:16px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:14px;color:#334155;">${escapeHtml(inv.periodText)}</td>
          <td style="padding:16px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:14px;font-weight:600;color:#0b1220;">${escapeHtml(total)}</td>
        </tr>
      </tbody>
    </table>

    <!-- TOTALS -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:18px 40px 0;width:calc(100% - 80px);">
      <tr>
        <td style="width:55%;vertical-align:top;padding-right:20px;font-size:12px;color:#64748b;line-height:1.7;">
          <strong style="color:#0b1220;">Notas</strong><br/>
          Acceso activo hasta <strong>${escapeHtml(inv.subscriptionEnd || "—")}</strong>. Sin IVA — emitido bajo régimen de
          autónomo no sujeto a IVA. Conserva esta factura para tus registros contables.
        </td>
        <td style="width:45%;vertical-align:top;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
            <tr><td style="padding:7px 12px;color:#475569;">Subtotal</td><td style="padding:7px 12px;text-align:right;color:#0b1220;font-weight:600;">${escapeHtml(total)}</td></tr>
            <tr><td style="padding:7px 12px;color:#475569;border-bottom:1px solid #e2e8f0;">IVA (0%)</td><td style="padding:7px 12px;text-align:right;color:#0b1220;font-weight:600;border-bottom:1px solid #e2e8f0;">€0,00</td></tr>
            <tr><td style="padding:12px;background:linear-gradient(135deg,#00e5a0,#00c87a);color:#04201a;font-weight:800;font-size:15px;border-radius:8px 0 0 8px;">TOTAL</td><td style="padding:12px;background:linear-gradient(135deg,#00e5a0,#00c87a);color:#04201a;font-weight:800;font-size:15px;text-align:right;border-radius:0 8px 8px 0;">${escapeHtml(total)}</td></tr>
            <tr><td style="padding:9px 12px;color:#00a06a;font-weight:700;">Pagado</td><td style="padding:9px 12px;text-align:right;color:#00a06a;font-weight:700;">${escapeHtml(total)}</td></tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- PAYMENT INFO -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:22px 40px 0;width:calc(100% - 80px);background:#f8fafc;border:1px dashed #cbd5e1;border-radius:10px;">
      <tr>
        <td style="padding:14px 18px;font-size:12px;color:#475569;">
          <strong style="color:#0b1220;display:block;margin-bottom:4px;">Información de pago</strong>
          Método: <strong>Stripe (tarjeta)</strong> &nbsp;·&nbsp; Referencia: <span style="font-family:monospace;">${escapeHtml(inv.paymentRef || "—")}</span>
        </td>
      </tr>
    </table>

    <!-- FOOTER -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:30px;">
      <tr>
        <td style="padding:22px 40px;border-top:2px solid #00c87a;text-align:center;">
          <div style="font-size:14px;font-weight:700;color:#0b1220;">¡Gracias por confiar en Omnira! 🎉</div>
          <div style="font-size:12px;color:#64748b;margin-top:6px;">
            ¿Dudas con tu factura? Escríbenos a <a href="mailto:${escapeHtml(BRAND.email)}" style="color:#00a06a;text-decoration:none;font-weight:600;">${escapeHtml(BRAND.email)}</a>
          </div>
          <div style="font-size:11px;color:#94a3b8;margin-top:10px;">Omnira · ${escapeHtml(BRAND.site)} · Factura ${escapeHtml(inv.number)}</div>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`;
}

/**
 * Load a payment + its customer (and plan label) and return both the
 * normalized data and the rendered A4 HTML. Used by the admin preview/resend.
 */
export async function getInvoiceById(paymentId) {
  const { data: payment, error } = await supabaseAdmin
    .from("customer_payments")
    .select(
      "id, customer_user_id, plan_id, stripe_payment_intent_id, stripe_checkout_session_id, amount_cents, currency, period_days, subscription_end_after, created_at"
    )
    .eq("id", paymentId)
    .maybeSingle();
  if (error) throw error;
  if (!payment) return null;

  const { data: user } = await supabaseAdmin
    .from("customer_users")
    .select("email, first_name, last_name")
    .eq("id", payment.customer_user_id)
    .maybeSingle();

  let planLabel = payment.plan_id;
  try {
    const plan = await getCheckoutPlan(payment.plan_id);
    if (plan?.label) planLabel = plan.label;
  } catch {
    /* ignore — fall back to plan_id */
  }

  const inv = buildInvoiceData({ payment, user, planLabel });
  return { payment, user, inv, html: renderInvoiceHtml(inv) };
}

/**
 * Send the invoice email for a just-completed payment. Best-effort: never
 * throws into the payment flow. `plan` is the resolved checkout plan object.
 */
export async function sendInvoiceForPayment({
  customerId,
  plan,
  amountCents,
  currency = "eur",
  periodDays,
  paymentRef,
  createdAt,
  subscriptionEnd,
}) {
  try {
    if (!isEmailConfigured()) {
      console.warn("[invoice] SMTP not configured — skipping invoice email");
      return { ok: false, reason: "email_not_configured" };
    }
    const { data: user } = await supabaseAdmin
      .from("customer_users")
      .select("email, first_name, last_name")
      .eq("id", customerId)
      .maybeSingle();
    if (!user?.email) return { ok: false, reason: "no_email" };

    const payment = {
      id: paymentRef || "",
      plan_id: plan?.id || "",
      stripe_payment_intent_id: paymentRef || "",
      amount_cents: amountCents,
      currency,
      period_days: periodDays,
      subscription_end_after: subscriptionEnd,
      created_at: createdAt || new Date().toISOString(),
    };
    const inv = buildInvoiceData({ payment, user, planLabel: plan?.label });
    const html = renderInvoiceHtml(inv);

    await sendEmail({
      to: user.email,
      subject: `Tu factura de Omnira · ${inv.number}`,
      html,
      text:
        `Gracias por tu compra en Omnira.\n\n` +
        `Factura: ${inv.number}\nPlan: ${inv.planLabel} (${inv.periodText})\n` +
        `Total: ${eur(inv.amountCents, inv.currency)}\nAcceso hasta: ${inv.subscriptionEnd}\n\n` +
        `Soporte: ${BRAND.email}`,
    });
    return { ok: true };
  } catch (e) {
    console.warn("[invoice] sendInvoiceForPayment failed:", e?.message || e);
    return { ok: false, reason: e?.message || "send_failed" };
  }
}
