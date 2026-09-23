import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import vm from "node:vm";

const htmlPath = new URL("../public/demo/index.html", import.meta.url);
const html = fs.readFileSync(htmlPath, "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
const vercelConfig = JSON.parse(fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
const vercelIgnore = fs.readFileSync(new URL("../.vercelignore", import.meta.url), "utf8");

assert.ok(script, "the static app has an inline script");
new vm.Script(script, { filename: htmlPath.pathname });
assert.match(html, /Fake UPI alias/);
assert.match(html, /Fake account last 4 digits/);
assert.match(html, /receipt.*temporary preview/i);
assert.match(html, /no money is sent/i);
assert.doesNotMatch(html, /sk_live_[A-Za-z0-9]+|sk_test_[A-Za-z0-9]+|AIza[\w-]{20,}/);

const policy = vercelConfig.headers
  ?.filter((rule) => rule.source === "/demo/(.*)" || rule.source === "/(.*)")
  .flatMap((rule) => rule.headers) ?? [];
const header = (name) => policy.find((item) => item.key.toLowerCase() === name.toLowerCase())?.value;
const csp = header("Content-Security-Policy") ?? "";
const scriptHash = crypto.createHash("sha256").update(script).digest("base64");

assert.ok(csp.includes(`'sha256-${scriptHash}'`), "CSP hash matches the shipped inline app script");
assert.match(csp, /script-src-attr 'none'/, "inline event-handler scripts stay blocked");
assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/, "inline scripts are not broadly allowed");
assert.equal(header("X-Content-Type-Options"), "nosniff");
assert.equal(header("X-Frame-Options"), "DENY");
assert.equal(header("Referrer-Policy"), "strict-origin-when-cross-origin");
assert.equal(header("Permissions-Policy"), "camera=(), microphone=(), geolocation=()");
assert.match(vercelIgnore, /^\.git$/m, "Git history is not uploaded as a site asset");
assert.match(vercelIgnore, /^\.vercel$/m, "local Vercel metadata is not uploaded as a site asset");
assert.match(vercelIgnore, /^README\.md$/m, "repo documentation is not uploaded as a site asset");
assert.match(vercelIgnore, /^tests\/$/m, "smoke tests are not uploaded as site assets");

console.log("PASS: app parses, demo safeguards hold, and static security headers match the shipped script.");
