import { config } from './config.js';
import { startWhatsApp } from './whatsapp.js';
import { ask, handleReset } from './agent.js';

const RESET_COMMANDS = new Set(['/reset', '/new']);

async function main(): Promise<void> {
  console.log(`Allowlisted numbers: ${config.allowlistJids.size}`);

  await startWhatsApp(async ({ jid, text, reply, sendTyping }) => {
    // Hard allowlist: silently ignore anyone who isn't us.
    if (!config.allowlistJids.has(jid)) return;

    if (RESET_COMMANDS.has(text.toLowerCase())) {
      await handleReset(jid);
      await reply('Started a fresh conversation.');
      return;
    }

    if (text.length > config.maxMessageChars) {
      await reply(`Message too long (max ${config.maxMessageChars} characters).`);
      return;
    }

    await sendTyping();
    try {
      const { text: answer, citations } = await ask(jid, text);
      const sources = citations.length
        ? `\n\nSources:\n${citations
            .slice(0, 5)
            .map((url) => `- ${url}`)
            .join('\n')}`
        : '';
      await reply(answer + sources);
    } catch (err) {
      console.error('Agent error:', err);
      await reply('Sorry, something went wrong reaching the assistant. Please try again.');
    }
  });
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
