import { existsSync } from 'node:fs';
import { readFile, rename, writeFile } from 'node:fs/promises';

const STORE_PATH = new URL('../group-history.json', import.meta.url);
const TMP_PATH = new URL('../group-history.json.tmp', import.meta.url);

export interface GroupHistoryMessage {
  senderJid: string;
  senderName: string;
  text: string;
  timestamp: number;
}

type StoreShape = Record<string, GroupHistoryMessage[]>;

export class GroupHistoryStore {
  private data: StoreShape = {};
  private loaded = false;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly maxMessages: number,
    private readonly maxMessageChars: number,
  ) {}

  private runExclusive<T>(action: () => Promise<T>): Promise<T> {
    const result = this.tail.then(action, action);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    if (existsSync(STORE_PATH)) {
      this.data = JSON.parse(await readFile(STORE_PATH, 'utf8')) as StoreShape;
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    await writeFile(TMP_PATH, JSON.stringify(this.data, null, 2), 'utf8');
    await rename(TMP_PATH, STORE_PATH);
  }

  /**
   * Stores a group message and returns the messages that preceded it, oldest first.
   * This keeps the invoking message out of its own "previous messages" context.
   */
  capture(groupJid: string, message: GroupHistoryMessage): Promise<GroupHistoryMessage[]> {
    return this.runExclusive(async () => {
      await this.load();
      const existing = this.data[groupJid] ?? [];
      const previous = existing.slice(-this.maxMessages);
      const text =
        message.text.length > this.maxMessageChars
          ? `${message.text.slice(0, this.maxMessageChars)} [truncated]`
          : message.text;
      this.data[groupJid] = [...existing, { ...message, text }].slice(-this.maxMessages);
      await this.persist();
      return previous;
    });
  }

  clear(groupJid: string): Promise<void> {
    return this.runExclusive(async () => {
      await this.load();
      delete this.data[groupJid];
      await this.persist();
    });
  }
}
