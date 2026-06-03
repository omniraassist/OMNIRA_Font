/**
 * IMAP wrapper for the admin Correos panel. Per-request connect → select →
 * fetch/mutate → close. We deliberately do NOT pool connections: Vercel
 * serverless functions get cold-restarted and any held socket leaks. The cost
 * is ~1 s per request on Hostinger IMAP, which is acceptable for an admin UI.
 *
 * Auth defaults to SMTP_USER / SMTP_PASS so the operator doesn't have to set a
 * second credential. Host/port default to Hostinger's IMAP endpoint, which is
 * what 99% of installs use today; both are overridable via IMAP_HOST/IMAP_PORT.
 *
 * Folder names vary by provider (Hostinger uses bare "Sent", "Drafts", etc.,
 * Gmail uses "[Gmail]/Sent Mail"), so we never hardcode names — we discover
 * special-use folders via the LIST response and expose a stable virtual key
 * (inbox/sent/drafts/spam/trash) to the UI.
 */
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

const HOST = String(process.env.IMAP_HOST || "imap.hostinger.com").trim();
const PORT = Number(process.env.IMAP_PORT || 993);
const USER = String(process.env.IMAP_USER || process.env.SMTP_USER || "").trim();
const PASS = String(process.env.IMAP_PASS || process.env.SMTP_PASS || "").trim();
const SECURE = PORT === 993; // 993 = implicit TLS, 143 = STARTTLS

export function isImapConfigured() {
  return Boolean(HOST && USER && PASS);
}

export function imapConfigDiagnostics() {
  return {
    IMAP_HOST: HOST || null,
    IMAP_PORT: PORT || null,
    IMAP_USER: Boolean(USER),
    IMAP_PASS: Boolean(PASS),
    user_hint: USER ? `${USER.slice(0, 2)}***@${USER.split("@")[1] || ""}` : null,
  };
}

function newClient() {
  return new ImapFlow({
    host: HOST,
    port: PORT,
    secure: SECURE,
    auth: { user: USER, pass: PASS },
    // Suppress noisy info logs in production — only surface errors.
    logger: false,
  });
}

async function withClient(fn) {
  if (!isImapConfigured()) {
    throw new Error("IMAP no configurado (faltan IMAP_USER/IMAP_PASS o SMTP_USER/SMTP_PASS).");
  }
  const client = newClient();
  await client.connect();
  try {
    return await fn(client);
  } finally {
    try {
      await client.logout();
    } catch {
      /* socket already closed */
    }
  }
}

/**
 * Returns the list of mailboxes with a normalized virtual key + unread count.
 * The UI navigates by `key` ("inbox" / "sent" / etc.) and we map that back to
 * the actual mailbox path before any IMAP call.
 */
const SPECIAL_USE_TO_KEY = {
  "\\Inbox": "inbox",
  "\\Sent": "sent",
  "\\Drafts": "drafts",
  "\\Junk": "spam",
  "\\Trash": "trash",
  "\\Archive": "archive",
  "\\Flagged": "starred",
};

function fallbackKeyForName(name) {
  const lower = String(name || "").toLowerCase();
  if (lower === "inbox") return "inbox";
  if (lower.includes("sent")) return "sent";
  if (lower.includes("draft")) return "drafts";
  if (lower.includes("spam") || lower.includes("junk")) return "spam";
  if (lower.includes("trash") || lower.includes("deleted")) return "trash";
  if (lower.includes("archive")) return "archive";
  return null;
}

export async function listFolders() {
  return withClient(async (client) => {
    const list = await client.list({ subscribed: false, statusQuery: { unseen: true, messages: true } });
    const folders = [];
    const seenKeys = new Set();
    for (const m of list || []) {
      const su = m.specialUse || null;
      let key = su ? SPECIAL_USE_TO_KEY[su] : null;
      if (!key) key = fallbackKeyForName(m.path);
      // INBOX is always "inbox" even if the server doesn't tag it.
      if (m.path === "INBOX") key = "inbox";
      folders.push({
        key: key && !seenKeys.has(key) ? key : null,
        path: m.path,
        name: m.name || m.path,
        specialUse: su,
        unread: m.status?.unseen ?? null,
        total: m.status?.messages ?? null,
      });
      if (key) seenKeys.add(key);
    }
    return folders;
  });
}

/**
 * Resolve a virtual key ("inbox") to an actual mailbox path on this server.
 * If the key is already a server-side path (e.g. "INBOX.Spam"), it's returned
 * verbatim so the UI can also pass raw paths.
 */
export async function resolveFolderPath(keyOrPath) {
  const v = String(keyOrPath || "").trim() || "inbox";
  if (v === "inbox") return "INBOX";
  // "starred" is a VIRTUAL view, not a server-side folder — flagged messages
  // live wherever they were originally received. We anchor the view to INBOX
  // so list/move/flag operations all target a real mailbox; the actual
  // \Flagged filter is layered on top inside listMessages().
  if (v === "starred") return "INBOX";
  if (!["sent", "drafts", "spam", "trash", "archive"].includes(v)) {
    // Treat as raw path
    return v;
  }
  const folders = await listFolders();
  const hit = folders.find((f) => f.key === v);
  if (hit) return hit.path;
  // Fallbacks when special-use isn't advertised — try common names.
  const tries = {
    sent: ["Sent", "INBOX.Sent", "Sent Items", "Sent Messages"],
    drafts: ["Drafts", "INBOX.Drafts"],
    spam: ["Spam", "Junk", "INBOX.Spam", "INBOX.Junk"],
    trash: ["Trash", "INBOX.Trash", "Deleted Items", "Deleted"],
    archive: ["Archive", "INBOX.Archive"],
    starred: ["Flagged", "Starred"],
  }[v];
  return tries?.[0] || "INBOX";
}

function envelopeAddrs(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((a) => {
    // imapflow normalizes addresses to {name, address}, but older RFC822
    // envelopes still hand back {name, mailbox, host}. Cover both.
    const address = a.address || [a.mailbox, a.host].filter(Boolean).join("@") || "";
    return { name: a.name || "", address };
  });
}

/**
 * Lightweight envelope listing for the message-list pane. Returns the newest
 * `limit` messages (offset = page * limit) in descending UID order.
 */
export async function listMessages({ folder = "inbox", page = 0, limit = 50, search = "" } = {}) {
  const isStarredView = String(folder).trim() === "starred";
  const path = await resolveFolderPath(folder);
  return withClient(async (client) => {
    const lock = await client.getMailboxLock(path);
    try {
      const box = client.mailbox;
      const total = box?.exists ?? 0;
      if (total === 0) return { folder: path, total: 0, messages: [] };

      // Build the search criteria. "Starred" is a virtual view, so we always
      // filter by \Flagged. Free-text search OR-combines from/subject/body.
      let uids;
      const q = String(search || "").trim();
      if (isStarredView && q) {
        uids = await client.search({ flagged: true, or: [{ from: q }, { subject: q }, { body: q }] }, { uid: true });
      } else if (isStarredView) {
        uids = await client.search({ flagged: true }, { uid: true });
      } else if (q) {
        uids = await client.search({ or: [{ from: q }, { subject: q }, { body: q }] }, { uid: true });
      } else {
        // Fast path: ask for the whole mailbox UID set.
        uids = await client.search({ all: true }, { uid: true });
      }
      uids = uids || [];
      const sorted = uids.slice().sort((a, b) => b - a); // newest first
      const pageUids = sorted.slice(page * limit, page * limit + limit);
      const filteredTotal = uids.length;

      const messages = [];
      if (pageUids.length) {
        for await (const msg of client.fetch(pageUids, {
          uid: true,
          envelope: true,
          flags: true,
          internalDate: true,
          size: true,
        })) {
          messages.push({
            uid: msg.uid,
            seq: msg.seq,
            size: msg.size,
            internalDate: msg.internalDate,
            date: msg.envelope?.date || msg.internalDate || null,
            subject: msg.envelope?.subject || "(sin asunto)",
            from: envelopeAddrs(msg.envelope?.from),
            to: envelopeAddrs(msg.envelope?.to),
            cc: envelopeAddrs(msg.envelope?.cc),
            messageId: msg.envelope?.messageId || null,
            flags: Array.from(msg.flags || []),
            seen: msg.flags?.has("\\Seen") || false,
            starred: msg.flags?.has("\\Flagged") || false,
          });
        }
        // Sort the page itself by UID desc (fetch order is server-dependent).
        messages.sort((a, b) => b.uid - a.uid);
      }
      return { folder: path, total: filteredTotal, page, limit, messages };
    } finally {
      lock.release();
    }
  });
}

/**
 * Fetch a single message body. We download the full raw RFC822 source and run
 * it through mailparser, which gives us clean HTML/text plus attachment
 * metadata — far simpler than driving the IMAP BODYSTRUCTURE walk by hand.
 */
export async function fetchMessage({ folder = "inbox", uid }) {
  if (!uid) throw new Error("uid is required");
  const path = await resolveFolderPath(folder);
  return withClient(async (client) => {
    const lock = await client.getMailboxLock(path);
    try {
      const dl = await client.download(Number(uid), undefined, { uid: true });
      if (!dl) return null;
      const parsed = await simpleParser(dl.content);

      // Mark seen after a successful read (matches mainstream client UX).
      try {
        await client.messageFlagsAdd(Number(uid), ["\\Seen"], { uid: true });
      } catch {
        /* read-only mailbox or already seen — fine */
      }

      const attachments = (parsed.attachments || []).map((a) => ({
        filename: a.filename || "adjunto",
        contentType: a.contentType || "application/octet-stream",
        size: a.size || a.content?.length || 0,
        contentId: a.contentId || null,
      }));

      return {
        uid: Number(uid),
        folder: path,
        date: parsed.date || null,
        subject: parsed.subject || "(sin asunto)",
        from: parsed.from?.value || [],
        to: parsed.to?.value || [],
        cc: parsed.cc?.value || [],
        bcc: parsed.bcc?.value || [],
        replyTo: parsed.replyTo?.value || [],
        messageId: parsed.messageId || null,
        inReplyTo: parsed.inReplyTo || null,
        text: parsed.text || "",
        html: parsed.html || null,
        attachments,
      };
    } finally {
      lock.release();
    }
  });
}

export async function setFlags({ folder = "inbox", uid, add = [], remove = [] }) {
  if (!uid) throw new Error("uid is required");
  const path = await resolveFolderPath(folder);
  return withClient(async (client) => {
    const lock = await client.getMailboxLock(path);
    try {
      if (add.length) await client.messageFlagsAdd(Number(uid), add, { uid: true });
      if (remove.length) await client.messageFlagsRemove(Number(uid), remove, { uid: true });
      return { ok: true };
    } finally {
      lock.release();
    }
  });
}

export async function moveMessage({ uid, fromFolder, toFolder }) {
  if (!uid) throw new Error("uid is required");
  const src = await resolveFolderPath(fromFolder || "inbox");
  const dst = await resolveFolderPath(toFolder);
  return withClient(async (client) => {
    const lock = await client.getMailboxLock(src);
    try {
      await client.messageMove(Number(uid), dst, { uid: true });
      return { ok: true, src, dst };
    } finally {
      lock.release();
    }
  });
}

/**
 * Append a sent message into the Sent folder so it shows up in the UI right
 * after the send (Hostinger SMTP doesn't auto-file Sent for us). Best-effort:
 * a failure here doesn't break the actual send, it just means the message
 * won't appear in /sent until the next IMAP sync.
 */
export async function appendToSent(raw) {
  if (!raw) return { ok: false };
  try {
    return await withClient(async (client) => {
      const sentPath = await resolveFolderPath("sent");
      await client.append(sentPath, raw, ["\\Seen"]);
      return { ok: true, sentPath };
    });
  } catch (e) {
    return { ok: false, message: e?.message || "append failed" };
  }
}
