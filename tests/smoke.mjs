import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const htmlPath = new URL("../index.html", import.meta.url);
const html = fs.readFileSync(htmlPath, "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];

assert.ok(script, "the static app has an inline script");
new vm.Script(script, { filename: htmlPath.pathname });
assert.match(html, /Fake UPI alias/);
assert.match(html, /Fake account last 4 digits/);
assert.match(html, /receipt.*temporary preview/i);
assert.match(html, /no money is sent/i);
assert.doesNotMatch(html, /sk_live_[A-Za-z0-9]+|sk_test_[A-Za-z0-9]+|AIza[\w-]{20,}/);

console.log("PASS: static app parses and public demo safeguards are present.");
