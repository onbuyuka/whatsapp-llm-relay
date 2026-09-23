# whatsapp-llm-relay

A personal WhatsApp bot that relays your messages to an **Azure AI Foundry agent** with
**Grounding with Bing Search**, so you can ask questions and get live, web-grounded answers
(match scores, news, etc.) over an airline's zero-rated WhatsApp connection.

The bot connects to WhatsApp **outbound** (via Baileys, like WhatsApp Web), so it needs
**no public IP, port, or webhook** — ideal for a VM behind NAT. Conversations are
**stateful** (one thread per direct chat or group, stored server-side by Foundry) and reset
either manually (`/reset`) or automatically after an idle period.

```
Phone (WhatsApp, zero-rated) ⇄ WhatsApp servers ⇄ this bot on your VM
    → Azure AI Foundry agent (Grounding with Bing Search) → grounded reply
```

## Prerequisites

1. **Node.js 20+** on the VM.
2. An **Azure AI Foundry agent** with the **Web search** (Grounding with Bing Search)
   tool attached. Copy its **OpenAI "responses" protocol endpoint** URL, which looks like:
   `https://<resource>.services.ai.azure.com/api/projects/<project>/agents/<agent>/endpoint/protocols/openai/responses`
3. Be signed in for keyless auth via `DefaultAzureCredential` — either run `az login` on
   the VM, or use the VM's managed identity. The identity needs an **Azure AI User** role
   (or equivalent) on the Foundry project.

## Setup

```bash
npm install
cp .env.example .env   # then fill in the values
```

`.env` values:

| Variable | Description |
| --- | --- |
| `AGENT_RESPONSES_URL` | The agent's OpenAI `responses` protocol endpoint URL (see prerequisites) |
| `AGENT_API_VERSION` | API version for the endpoint (default `v1`; `2025-11-15-preview` also works) |
| `ALLOWLIST_NUMBERS` | Comma-separated allowed numbers, digits only with country code, no `+` or spaces |
| `IDLE_RESET_HOURS` | Idle hours before a new conversation is auto-started (default `8`) |
| `MAX_MESSAGE_CHARS` | Max characters accepted per message (default `2000`) |
| `GROUP_HISTORY_MESSAGES` | Recent text messages retained per group (default `50`) |

## Run

```bash
npm run dev     # development (watch)
# or
npm run build && npm start
```

On first start a **QR code** prints in the terminal. Scan it in the phone that owns the
bot number: **WhatsApp > Settings > Linked devices > Link a device**. The pairing is saved
to `auth/`, so you won't need to re-scan on restart.

Message the bot from an **allowlisted** number to chat. Messages from any other number are
silently ignored.

The bot also works in group chats. Add its WhatsApp account to a group and mention it in a
message to get a response. Only allowlisted participants can invoke it. Each group has one
shared conversation thread.

The relay retains the most recent group text messages locally, including messages from
participants who are not allowlisted. When an allowlisted participant mentions the bot,
those prior messages are supplied to Azure AI as context, so requests such as
`@Bot translate the last 5 messages into English` work. The invoking message is not included
in its own history. Only messages received while the relay is connected are available.

Because group messages may be stored locally and sent to Azure AI, disclose this behavior to
group participants before enabling the bot in a group.

### Commands

- `/reset` or `/new` — start a fresh conversation. In a group, mention the bot in the
  command message; this also clears that group's locally retained message history.

## Keeping it running on the VM

Use a process manager so it restarts and keeps the WhatsApp session alive:

```bash
npm run build
pm2 start dist/index.js --name whatsapp-llm-relay
pm2 save
```

## Notes

- **Baileys is an unofficial WhatsApp client.** There is a small risk to the number under
  WhatsApp's terms. Keep volume low and use your own number.
- `auth/`, `conversations.json`, `group-history.json`, and `.env` contain
  secrets/session or private message data and are git-ignored.
- A committed pre-commit hook (`.githooks/pre-commit`) blocks accidental commits of secrets or
  session data. After cloning, enable it with `git config core.hooksPath .githooks`.
- Web search is powered by the agent's **Web search (Grounding with Bing Search)** tool,
  the official successor to the retired key-based Bing Search API. The bot calls the agent's
  OpenAI-compatible **Responses** endpoint and chains turns with `previous_response_id`.
