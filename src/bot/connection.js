// WhatsApp connection using Baileys (unofficial WhatsApp Web client).
// See PLAN.md section 5: WhatsApp's Terms do not allow unofficial clients and the number can be banned.
import * as baileysNs from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';

// Baileys is CommonJS; pick the named exports from whichever shape Node gives us.
const pick = (name) => baileysNs[name] ?? baileysNs.default?.[name];
const makeWASocket = pick('makeWASocket') ?? (typeof baileysNs.default === 'function' ? baileysNs.default : baileysNs.default?.default);
const useMultiFileAuthState = pick('useMultiFileAuthState');
const DisconnectReason = pick('DisconnectReason');
const jidNormalizedUser = pick('jidNormalizedUser');
const fetchLatestBaileysVersion = pick('fetchLatestBaileysVersion');

const METADATA_TTL_MS = 5 * 60_000;

function extractText(m) {
  if (!m) return '';
  if (m.ephemeralMessage) return extractText(m.ephemeralMessage.message);
  if (m.viewOnceMessage) return extractText(m.viewOnceMessage.message);
  if (m.groupInviteMessage) {
    const g = m.groupInviteMessage;
    return `https://chat.whatsapp.com/${g.inviteCode} ${g.groupName || ''} ${g.caption || ''}`;
  }
  return m.conversation
    || m.extendedTextMessage?.text
    || m.imageMessage?.caption
    || m.videoMessage?.caption
    || m.documentMessage?.caption
    || '';
}

function contextInfo(m) {
  return m?.extendedTextMessage?.contextInfo || m?.imageMessage?.contextInfo || m?.videoMessage?.contextInfo || {};
}

export async function connect({ authDir, logger, onMessage, attempt = 0 }) {
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
  const sock = makeWASocket({ auth: state, version, logger: logger.child({ module: 'baileys' }), markOnlineOnConnect: false });

  const metaCache = new Map();
  async function metadata(jid) {
    const hit = metaCache.get(jid);
    if (hit && hit.at > Date.now() - METADATA_TTL_MS) return hit.data;
    const data = await sock.groupMetadata(jid);
    metaCache.set(jid, { data, at: Date.now() });
    return data;
  }
  const botIds = () => [sock.user?.id, sock.user?.lid].filter(Boolean).map((j) => jidNormalizedUser(j));
  const adminOf = async (groupJid, ids) => {
    const meta = await metadata(groupJid);
    return meta.participants.some((p) => p.admin && ids.includes(jidNormalizedUser(p.id)));
  };

  const client = {
    sendText: (jid, text, { mentions, quoted } = {}) => sock.sendMessage(jid, { text, mentions }, quoted ? { quoted } : undefined),
    deleteMessage: (jid, raw) => sock.sendMessage(jid, { delete: raw.key }),
    removeMember: (jid, user) => sock.groupParticipantsUpdate(jid, [user], 'remove'),
    isAdmin: (jid, user) => adminOf(jid, [jidNormalizedUser(user)]),
    botIsAdmin: (jid) => adminOf(jid, botIds()),
  };

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('group-participants.update', ({ id }) => metaCache.delete(id));
  sock.ev.on('groups.update', (updates) => updates.forEach((u) => metaCache.delete(u.id)));

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('Scan this QR code with the bot\'s WhatsApp (Settings → Linked devices):');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'open') { attempt = 0; logger.info('connected to WhatsApp'); }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        logger.error(`logged out: delete ${authDir} and restart to scan a new QR code`);
        process.exit(1);
      }
      const delay = Math.min(60_000, 3000 * 2 ** attempt); // 3s, 6s, 12s ... up to 1 min
      logger.warn({ code, delay }, 'connection closed, reconnecting');
      setTimeout(() => connect({ authDir, logger, onMessage, attempt: attempt + 1 }), delay);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const raw of messages) {
      const groupJid = raw.key.remoteJid;
      if (!groupJid?.endsWith('@g.us') || !raw.message) continue;
      try {
        await onMessage(client)({
          groupJid,
          senderJid: raw.key.participant || raw.participant,
          text: extractText(raw.message),
          fromMe: raw.key.fromMe,
          forwardingScore: contextInfo(raw.message).forwardingScore ?? 0,
          raw,
        });
      } catch (err) {
        logger.error({ err, groupJid }, 'failed to handle message');
      }
    }
  });

  return sock;
}
