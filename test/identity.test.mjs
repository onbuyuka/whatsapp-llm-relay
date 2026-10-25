import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { DefaultAzureCredential } from "@azure/identity";

const require = createRequire(import.meta.url);
const identityRequire = createRequire(require.resolve("@azure/identity"));
const { CryptoProvider, PublicClientApplication } = identityRequire("@azure/msal-node");

test("MSAL generates UUID v4 correlation IDs with the patched UUID dependency", () => {
  const crypto = new CryptoProvider();
  const first = crypto.createNewGuid();
  const second = crypto.createNewGuid();
  const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  assert.match(first, uuidV4);
  assert.match(second, uuidV4);
  assert.notEqual(first, second);
});

test("MSAL initializes its token cache and correlation ID without a network request", async () => {
  const unexpectedRequest = async () => {
    assert.fail("Token-cache initialization must not make a network request.");
  };
  const application = new PublicClientApplication({
    auth: { clientId: "00000000-0000-4000-8000-000000000001" },
    system: {
      networkClient: {
        sendGetRequestAsync: unexpectedRequest,
        sendPostRequestAsync: unexpectedRequest,
      },
    },
  });
  assert.deepEqual(await application.getTokenCache().getAllAccounts(), []);
});

test("the relay's DefaultAzureCredential remains constructible without requesting a token", () => {
  const credential = new DefaultAzureCredential();
  assert.equal(typeof credential.getToken, "function");
});
