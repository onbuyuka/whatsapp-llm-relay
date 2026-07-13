import 'dotenv/config';
import { DefaultAzureCredential } from '@azure/identity';

// Probe the agent-scoped OpenAI Responses endpoint to learn its contract.
// The endpoint is read from AGENT_RESPONSES_URL in .env (never hardcoded).
const API_VERSION =
  process.env.PROBE_API_VERSION ?? process.env.AGENT_API_VERSION ?? 'v1';
const baseUrl = process.env.AGENT_RESPONSES_URL;
if (!baseUrl) {
  throw new Error('Set AGENT_RESPONSES_URL in .env before running the probe.');
}
const AGENT_URL = baseUrl.includes('api-version=')
  ? baseUrl
  : `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}api-version=${API_VERSION}`;

async function main(): Promise<void> {
  const credential = new DefaultAzureCredential();
  const token = (await credential.getToken('https://ai.azure.com/.default')).token;

  const body = {
    input: "In one sentence, give one current top world-news headline today and cite the source.",
  };

  const res = await fetch(AGENT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  console.log('HTTP', res.status, res.statusText);
  const text = await res.text();
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log(text);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
