import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

/** Convert an E.164-ish number (digits only) into a WhatsApp individual JID. */
function toJid(rawNumber: string): string {
  const digits = rawNumber.replace(/[^0-9]/g, '');
  return `${digits}@s.whatsapp.net`;
}

/** Ensure the agent Responses URL carries an api-version query parameter. */
function withApiVersion(url: string, apiVersion: string): string {
  if (url.includes('api-version=')) return url;
  return `${url}${url.includes('?') ? '&' : '?'}api-version=${apiVersion}`;
}

function positiveInteger(name: string, fallback: string): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

const allowlistNumbers = (process.env.ALLOWLIST_NUMBERS ?? '')
  .split(',')
  .map((n) => n.trim())
  .filter((n) => n.length > 0);

export const config = {
  agentResponsesUrl: withApiVersion(
    required('AGENT_RESPONSES_URL'),
    process.env.AGENT_API_VERSION ?? 'v1',
  ),
  allowlistJids: new Set(allowlistNumbers.map(toJid)),
  idleResetMs: Number(process.env.IDLE_RESET_HOURS ?? '8') * 60 * 60 * 1000,
  maxMessageChars: positiveInteger('MAX_MESSAGE_CHARS', '2000'),
  groupHistoryMessages: positiveInteger('GROUP_HISTORY_MESSAGES', '50'),
};

if (config.allowlistJids.size === 0) {
  throw new Error('ALLOWLIST_NUMBERS must contain at least one number.');
}
