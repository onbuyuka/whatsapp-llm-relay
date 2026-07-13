import { readFile, writeFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const STORE_PATH = new URL('../conversations.json', import.meta.url);
const TMP_PATH = new URL('../conversations.json.tmp', import.meta.url);

interface ConversationRecord {
  responseId: string;
  lastActivity: number;
}

type StoreShape = Record<string, ConversationRecord>;

/**
 * Persists a WhatsApp-JID -> last Responses API response id, so multi-turn
 * conversations can be chained via `previous_response_id` and survive restarts.
 * `lastActivity` drives idle auto-reset.
 */
export class ConversationStore {
  private data: StoreShape = {};
  private loaded = false;

  private async load(): Promise<void> {
    if (this.loaded) return;
    if (existsSync(STORE_PATH)) {
      try {
        this.data = JSON.parse(await readFile(STORE_PATH, 'utf8')) as StoreShape;
      } catch {
        this.data = {};
      }
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    await writeFile(TMP_PATH, JSON.stringify(this.data, null, 2), 'utf8');
    await rename(TMP_PATH, STORE_PATH);
  }

  async get(jid: string): Promise<ConversationRecord | undefined> {
    await this.load();
    return this.data[jid];
  }

  async set(jid: string, responseId: string): Promise<void> {
    await this.load();
    this.data[jid] = { responseId, lastActivity: Date.now() };
    await this.persist();
  }

  async clear(jid: string): Promise<void> {
    await this.load();
    delete this.data[jid];
    await this.persist();
  }
}
