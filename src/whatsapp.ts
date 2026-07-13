import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const AUTH_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'auth');

export interface MessageContext {
  jid: string;
  text: string;
  reply: (text: string) => Promise<void>;
  sendTyping: () => Promise<void>;
}

export type MessageHandler = (ctx: MessageContext) => Promise<void>;

/**
 * Connects to WhatsApp via Baileys (outbound, like WhatsApp Web — no webhook or
 * public IP needed). Persists the pairing to auth/ so re-scans aren't needed.
 * On disconnect it reconnects automatically unless we were explicitly logged out.
 */
export async function startWhatsApp(onMessage: MessageHandler): Promise<void> {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: process.env.LOG_LEVEL ?? 'silent' }),
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrcode.generate(qr, { small: true });
      console.log('Scan the QR above: WhatsApp > Settings > Linked devices > Link a device.');
    }

    if (connection === 'open') {
      console.log('WhatsApp connection open.');
    }

    if (connection === 'close') {
      const statusCode = (
        lastDisconnect?.error as { output?: { statusCode?: number } } | undefined
      )?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      console.log(
        `Connection closed (code ${statusCode ?? 'unknown'}).` +
          (loggedOut
            ? ' Logged out — delete the auth/ folder and re-scan.'
            : ' Reconnecting...'),
      );
      if (!loggedOut) {
        setTimeout(() => void startWhatsApp(onMessage), 2000);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      // The chat address to reply to (may be a @lid on newer WhatsApp).
      const remoteJid = msg.key.remoteJid ?? undefined;
      if (!remoteJid || remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') {
        continue;
      }

      // The sender's real phone-number JID, used for allowlist + conversation key.
      // On the new addressing scheme remoteJid is a @lid, so prefer senderPn.
      const senderPn = (msg.key as { senderPn?: string }).senderPn;
      const senderJid = senderPn ?? remoteJid;

      const text =
        msg.message.conversation ?? msg.message.extendedTextMessage?.text ?? '';
      if (!text.trim()) continue;

      const ctx: MessageContext = {
        jid: senderJid,
        text: text.trim(),
        reply: async (t) => {
          await sock.sendMessage(remoteJid, { text: t });
        },
        sendTyping: async () => {
          await sock.sendPresenceUpdate('composing', remoteJid);
        },
      };

      try {
        await onMessage(ctx);
      } catch (err) {
        console.error('Handler error:', err);
      }
    }
  });
}
