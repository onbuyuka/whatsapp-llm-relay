import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const AUTH_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'auth');

export interface MessageContext {
  senderJid: string;
  senderName: string;
  conversationJid: string;
  isGroup: boolean;
  botWasMentioned: boolean;
  receivedAt: number;
  text: string;
  reply: (text: string) => Promise<void>;
  sendTyping: () => Promise<void>;
}

export type MessageHandler = (ctx: MessageContext) => Promise<void>;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

      // The chat address to reply to (may be a @lid on newer direct chats).
      const remoteJid = msg.key.remoteJid ?? undefined;
      if (!remoteJid || remoteJid === 'status@broadcast') {
        continue;
      }
      const isGroup = remoteJid.endsWith('@g.us');

      // Prefer the phone-number JID so allowlisting also works with LID addressing.
      const senderJid = isGroup
        ? msg.key.participantPn ?? msg.key.senderPn ?? msg.key.participant
        : msg.key.senderPn ?? remoteJid;
      if (!senderJid) continue;

      let text =
        msg.message.conversation ?? msg.message.extendedTextMessage?.text ?? '';
      if (!text.trim()) continue;

      let botWasMentioned = false;
      if (isGroup) {
        const mentionedJids =
          msg.message.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
        const botJids = [
          sock.user?.id,
          sock.user?.jid,
          sock.user?.lid,
          state.creds.me?.id,
          state.creds.me?.jid,
          state.creds.me?.lid,
        ]
          .filter((jid): jid is string => Boolean(jid))
          .map(jidNormalizedUser);
        botWasMentioned = mentionedJids
          .map(jidNormalizedUser)
          .some((jid) => botJids.includes(jid));

        if (botWasMentioned) {
          const botNames = [sock.user?.name, state.creds.me?.name].filter(
            (name): name is string => Boolean(name),
          );
          for (const botName of botNames) {
            text = text.replace(
              new RegExp(`@${escapeRegExp(botName)}\\s*`, 'gi'),
              '',
            );
          }
          for (const botJid of botJids) {
            const mentionHandle = botJid.split('@')[0];
            text = text.replace(new RegExp(`@${mentionHandle}\\b`, 'g'), '');
          }
          if (!text.trim()) continue;
        }

        if (mentionedJids.length > 0) {
          console.log(`Group mention received (targets bot: ${botWasMentioned}).`);
        }
      }

      const normalizedSenderJid = jidNormalizedUser(senderJid);
      const ctx: MessageContext = {
        senderJid: normalizedSenderJid,
        senderName: msg.pushName?.trim() || normalizedSenderJid.split('@')[0],
        conversationJid: isGroup ? remoteJid : normalizedSenderJid,
        isGroup,
        botWasMentioned,
        receivedAt: Date.now(),
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
