import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const authForm = fs.readFileSync(new URL("../components/auth-form.tsx", import.meta.url), "utf8");
const proxy = fs.readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");

test("signup requests only business or clipper and uses verified email callbacks", () => {
  assert.match(authForm, /useState<"business" \| "clipper">/);
  assert.match(authForm, /requested_role: role/);
  assert.match(authForm, /emailRedirectTo: `\$\{window\.location\.origin\}\/auth\/callback/);
  assert.match(authForm, /signInWithPassword/);
  assert.match(authForm, /minLength=\{12\}/);
  assert.doesNotMatch(authForm, /<option[^>]+value="admin"/i);
});

test("server proxy refreshes Supabase sessions and emits a nonce CSP", () => {
  assert.match(proxy, /supabase\.auth\.getUser\(\)/);
  assert.match(proxy, /nonce/);
  assert.match(proxy, /script-src 'self' 'nonce-/);
  assert.match(proxy, /script-src-attr 'none'/);
  assert.match(proxy, /X-Content-Type-Options/);
});

test("the browser client is configured only with a publishable key", () => {
  const client = fs.readFileSync(new URL("../lib/supabase/client.ts", import.meta.url), "utf8");
  assert.match(client, /createBrowserClient/);
  assert.doesNotMatch(client, /service_role|SUPABASE_DB_PASSWORD|sb_secret_/i);
});
