const SECRETISH = /secret|password|passwd|token|credential|private|api[-_]?key|auth/i;
const WITHHELD = "withheld";
const REDACTED = "[redacted]";
const clip = (v, n = 48) => {
  if (v === REDACTED) return WITHHELD;
  const s = typeof v === "string" ? v : JSON.stringify(v);
  const out = s === void 0 ? "absent" : s;
  return out.length > n ? `${out.slice(0, n - 1)}\u2026` : out;
};
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
function diffSummary(r, max = 3) {
  const verb = [r.action?.verb, r.action?.api].filter(Boolean).join(" ");
  const sc = r.state_change;
  if (!sc || sc.before === void 0 && sc.after === void 0) return verb || (r.redacted?.includes("state_change") ? `state change ${WITHHELD}` : "no state recorded");
  const before = isObj(sc.before) ? sc.before : void 0;
  const after = isObj(sc.after) ? sc.after : void 0;
  if (!before && !after) return `${verb}: ${clip(sc.before)} \u2192 ${clip(sc.after)}`;
  const keys = [.../* @__PURE__ */ new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].filter((k) => JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k]));
  const hidden = (k) => SECRETISH.test(k) || before?.[k] === REDACTED || after?.[k] === REDACTED;
  const shown = keys.slice(0, max).map((k) => hidden(k) ? `${k}: changed (value ${WITHHELD})` : `${k}: ${clip(before?.[k], 24)} \u2192 ${clip(after?.[k], 24)}`);
  const more = keys.length > max ? ` (+${keys.length - max} more)` : "";
  const note = r.redacted?.includes("state_change") && !shown.some((x) => x.includes(WITHHELD)) ? " (secret values withheld)" : "";
  return `${verb ? `${verb}: ` : ""}${shown.join("; ") || "no field differs"}${more}${note}`;
}
function historyOf(resolutions, seq) {
  return resolutions.filter((r) => r.about?.seq === seq).sort((a, b) => b.seq - a.seq);
}

export { REDACTED, diffSummary, historyOf };
//# sourceMappingURL=diff.esm.js.map
