import { DefaultAzureCredential, type AccessToken } from '@azure/identity';
import { config } from './config.js';
import { ConversationStore } from './conversationStore.js';

const SCOPE = 'https://ai.azure.com/.default';

const credential = new DefaultAzureCredential();
const store = new ConversationStore();

let cachedToken: AccessToken | undefined;

async function getToken(): Promise<string> {
  const now = Date.now();
  if (!cachedToken || cachedToken.expiresOnTimestamp - now < 60_000) {
    const token = await credential.getToken(SCOPE);
    if (!token) throw new Error('Failed to acquire an Azure access token.');
    cachedToken = token;
  }
  return cachedToken.token;
}

export interface AgentReply {
  text: string;
  citations: string[];
}

// Minimal shape of the Responses API result we care about.
interface UrlCitationAnnotation {
  type: string;
  url?: string;
}
interface OutputTextContent {
  type: string;
  text?: string;
  annotations?: UrlCitationAnnotation[];
}
interface OutputItem {
  type: string;
  content?: OutputTextContent[];
}
interface ResponsesResult {
  id: string;
  status: string;
  output?: OutputItem[];
  error?: { message?: string } | null;
}

function extractReply(data: ResponsesResult): AgentReply {
  const parts: string[] = [];
  const citations: string[] = [];
  for (const item of data.output ?? []) {
    if (item.type !== 'message') continue;
    for (const content of item.content ?? []) {
      if (content.type !== 'output_text' || !content.text) continue;
      parts.push(content.text);
      for (const annotation of content.annotations ?? []) {
        if (annotation.type === 'url_citation' && annotation.url) {
          citations.push(annotation.url);
        }
      }
    }
  }
  return { text: parts.join('\n').trim(), citations: [...new Set(citations)] };
}

/** Manually reset the conversation for a JID (drops the stored response chain). */
export async function handleReset(jid: string): Promise<void> {
  await store.clear(jid);
}

/**
 * Sends the user's message to the Foundry agent's Responses endpoint, chaining
 * on the JID's previous response id for multi-turn context (unless idle-expired),
 * and returns the assistant's reply plus any web-search citations.
 */
export async function ask(jid: string, userText: string): Promise<AgentReply> {
  const existing = await store.get(jid);
  const stale = existing && Date.now() - existing.lastActivity > config.idleResetMs;
  const previousResponseId = existing && !stale ? existing.responseId : undefined;

  const token = await getToken();
  const res = await fetch(config.agentResponsesUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      input: userText,
      ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Agent request failed (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as ResponsesResult;
  if (data.status !== 'completed') {
    throw new Error(`Agent run status: ${data.status} ${data.error?.message ?? ''}`.trim());
  }

  await store.set(jid, data.id);
  return extractReply(data);
}
