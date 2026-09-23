import assert from "node:assert/strict";
import test from "node:test";
import { dateToIstNoonIso, istDateTimeToIso, parseCommaList, rupeesToPaise, safeHttpsUrl, urlMatchesPlatform } from "../lib/campaigns/validation.mjs";

test("INR input converts decimal rupees to integer paise without accepting ambiguous money", () => {
  assert.equal(rupeesToPaise("40"), 4000);
  assert.equal(rupeesToPaise("40.5"), 4050);
  assert.equal(rupeesToPaise("0.01"), 1);
  assert.equal(rupeesToPaise("1,000"), null);
  assert.equal(rupeesToPaise("-1"), null);
  assert.equal(rupeesToPaise("1.001"), null);
  assert.equal(rupeesToPaise("1e3"), null);
});

test("campaign language lists are normalized and bounded", () => {
  assert.deepEqual(parseCommaList("Hindi, English, hindi"), ["Hindi", "English"]);
  assert.equal(parseCommaList("one,two,three", 2), null);
});

test("external source and post links must be public HTTPS URLs", () => {
  assert.equal(safeHttpsUrl("https://www.instagram.com/reel/abc/"), "https://www.instagram.com/reel/abc/");
  for (const value of ["http://example.com/post", "https://localhost/post", "https://brand.local/post", "https://user:pass@example.com/post", "javascript:alert(1)", "https://example.com\\@evil.test"]) {
    assert.equal(safeHttpsUrl(value), null, value);
  }
});

test("a submission platform must match the published post host", () => {
  assert.equal(urlMatchesPlatform("https://www.instagram.com/reel/abc/", "instagram_reels"), true);
  assert.equal(urlMatchesPlatform("https://youtu.be/abc", "youtube_shorts"), true);
  assert.equal(urlMatchesPlatform("https://m.tiktok.com/@creator/video/123", "tiktok"), true);
  assert.equal(urlMatchesPlatform("https://instagram.com/reel/abc", "youtube_shorts"), false);
});

test("campaign datetime inputs are explicitly interpreted in India Standard Time", () => {
  assert.equal(istDateTimeToIso("2026-09-23T12:00"), "2026-09-23T06:30:00.000Z");
  assert.equal(istDateTimeToIso("2026-02-31T12:00"), null);
  assert.equal(istDateTimeToIso("2026-09-23T25:00"), null);
  assert.equal(dateToIstNoonIso("2026-09-23"), "2026-09-23T06:30:00.000Z");
  assert.equal(dateToIstNoonIso("2026-02-31"), null);
});
