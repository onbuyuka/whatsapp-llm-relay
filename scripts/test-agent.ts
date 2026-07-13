import { ask, handleReset } from '../src/agent.js';

const jid = 'test@s.whatsapp.net';

async function main(): Promise<void> {
  await handleReset(jid);

  const first = await ask(jid, 'Who is the current president of Turkey? One sentence.');
  console.log('\n--- Turn 1 ---');
  console.log(first.text);
  console.log('citations:', first.citations);

  const second = await ask(jid, 'And how old are they?');
  console.log('\n--- Turn 2 (follow-up, should use context) ---');
  console.log(second.text);
  console.log('citations:', second.citations);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
