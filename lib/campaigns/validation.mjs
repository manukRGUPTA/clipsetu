export function rupeesToPaise(input) {
  const value = String(input ?? "").trim();
  if (!/^(?:0|[1-9]\d{0,10})(?:\.\d{1,2})?$/.test(value)) return null;
  const [rupees, fraction = ""] = value.split(".");
  const paise = Number(rupees) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(paise) ? paise : null;
}

export function parseCommaList(input, maxItems = 12) {
  const values = String(input ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const seen = new Set();
  const unique = values.filter((value) => {
    const normalized = value.toLocaleLowerCase("en-IN");
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
  return unique.length <= maxItems ? unique : null;
}

export function safeHttpsUrl(input) {
  const value = String(input ?? "").trim();
  if (!value || value.length > 2048 || /[\s\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname.includes(".") || url.username || url.password) return null;
    if (url.hostname === "localhost" || url.hostname.endsWith(".localhost") || url.hostname.endsWith(".local")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function urlMatchesPlatform(input, platform) {
  const value = safeHttpsUrl(input);
  if (!value) return false;
  let host;
  try {
    host = new URL(value).hostname.toLowerCase();
  } catch {
    return false;
  }
  const isDomain = (domain) => host === domain || host.endsWith(`.${domain}`);
  if (platform === "instagram_reels") return isDomain("instagram.com");
  if (platform === "youtube_shorts") return isDomain("youtube.com") || isDomain("youtu.be");
  if (platform === "tiktok") return isDomain("tiktok.com");
  return platform === "other";
}

export function istDateTimeToIso(input) {
  const value = String(input ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+05:30`);
  if (Number.isNaN(date.valueOf())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const rendered = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  const roundTrip = `${rendered.year}-${rendered.month}-${rendered.day}T${rendered.hour}:${rendered.minute}`;
  return roundTrip === value ? date.toISOString() : null;
}

export function dateToIstNoonIso(input) {
  const value = String(input ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00+05:30`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) return null;
  return date.toISOString();
}

export function currentTimeMillis() {
  return Date.now();
}
