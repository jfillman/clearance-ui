const shortPrincipal = (p) => p ? p.replace(/^(user|group):([^/]+\/)?/, "") : "";
const isWorkload = (p) => !!p && !p.startsWith("user:");
function relativeTime(iso, now = Date.now()) {
  if (!iso) return "";
  const ms = now - new Date(iso).getTime();
  const s = Math.round(Math.abs(ms) / 1e3);
  let text;
  if (s < 60) text = `${s}s`;
  else if (s < 3600) text = `${Math.round(s / 60)} min`;
  else if (s < 86400) text = `${Math.round(s / 3600)} h`;
  else text = `${Math.round(s / 86400)} d`;
  return ms >= 0 ? text : `in ${text}`;
}
const parse = (iso) => {
  if (!iso) return void 0;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? void 0 : d;
};
function clock(iso, o = {}) {
  const d = parse(iso);
  if (!d) return iso ?? "";
  return d.toLocaleTimeString(o.locale, { timeZone: o.timeZone });
}
function dateTime(iso, o = {}) {
  const d = parse(iso);
  if (!d) return iso ?? "";
  return d.toLocaleString(o.locale, { timeZone: o.timeZone });
}
function dateTimeShort(iso, o = {}) {
  const d = parse(iso);
  if (!d) return iso ?? "";
  return d.toLocaleString(o.locale, { timeZone: o.timeZone, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function utcDateTime(iso, seconds = false) {
  const d = parse(iso);
  if (!d) return iso ?? "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}${seconds ? `:${p(d.getUTCSeconds())}` : ""}Z`;
}
function whenTitle(iso, o = {}) {
  const d = parse(iso);
  if (!d) return iso ?? "";
  return `${dateTime(iso, o)} (${utcDateTime(iso, true)})`;
}
function compact(n) {
  if (n === void 0 || n === null) return "";
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(n);
}
function ratio(used, limit) {
  if (!limit || limit <= 0) return 0;
  return Math.max(0, Math.min(1, (used ?? 0) / limit));
}
function runsInOf(d) {
  if (d.runsIn) return d.runsIn;
  const image = d.runtime?.image ?? "";
  return image && !/@sha256:0{64}$/.test(image) ? "cluster" : "client";
}
const RUNS_IN_TEXT = {
  cluster: { label: "in-cluster", why: "An AgentRun pod runs the loop with its runtime image; its model calls go through Clearance and count against the budget." },
  client: { label: "your MCP client", why: "No runtime: a person opens a session from their own MCP client, which is the loop. Clearance enforces every tool call; model calls are the client's own and are not counted." }
};
const preventFocusScroll = (e) => e.preventDefault();

export { RUNS_IN_TEXT, clock, compact, dateTime, dateTimeShort, isWorkload, preventFocusScroll, ratio, relativeTime, runsInOf, shortPrincipal, utcDateTime, whenTitle };
//# sourceMappingURL=format.esm.js.map
