const DAY = 864e5;
const RANK = { none: 0, healthy: 1, degraded: 2, blind: 3 };
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
function lastDays(now, count) {
  return Array.from({ length: count }, (_, i) => dayOf(now - (count - 1 - i) * DAY));
}
const windowStart = (now, count) => `${lastDays(now, count)[0]}T00:00:00Z`;
function healthOf(rec) {
  const r = rec;
  const source = typeof r.source === "string" ? r.source : r.source?.name;
  const s = r.health?.state;
  if (s === "healthy" || s === "degraded" || s === "blind") return { state: s, failed: (r.health?.checks ?? []).filter((c) => c.ok === false && c.name).map((c) => String(c.name)), source };
  if (r.gap || r.tool === "observation.audit-gap" || r.kind === "observation.audit-gap") return { state: "blind", failed: [], source };
  return void 0;
}
function buildHealthMatrix(scopes, byScope, now, count, meta = {}) {
  const days = lastDays(now, count);
  const rows = scopes.map((scope) => {
    const cells = new Map(days.map((d) => [d, { day: d, state: "none", records: 0, failed: [], sources: [] }]));
    for (const rec of byScope[scope] ?? []) {
      const h = healthOf(rec);
      const t = Date.parse(rec.ts);
      const cell = h && Number.isFinite(t) ? cells.get(dayOf(t)) : void 0;
      if (!h || !cell) continue;
      cell.records += 1;
      if (RANK[h.state] > RANK[cell.state]) cell.state = h.state;
      for (const f of h.failed) if (!cell.failed.includes(f)) cell.failed.push(f);
      if (h.source && !cell.sources.includes(h.source)) cell.sources.push(h.source);
    }
    const from = meta[scope]?.coveredFrom;
    const cutDay = from ? dayOf(Date.parse(from)) : void 0;
    const out = days.map((d) => {
      const cell = cells.get(d);
      if (cutDay && d < cutDay) return { ...cell, state: "none", records: 0, failed: [], sources: [], partial: true };
      return cutDay && d === cutDay ? { ...cell, partial: true } : cell;
    });
    return { scope, cells: out, ...meta[scope] };
  });
  return { days, rows };
}
function matrixSummary(m) {
  const out = { scopes: m.rows.length, unhealthy: 0, silentToday: 0, notLoaded: 0, unread: 0 };
  for (const r of m.rows) {
    if (r.error) {
      out.unread += 1;
      continue;
    }
    const unknown = (c) => !!c.partial && (c.state === "none" || c.state === "healthy");
    out.notLoaded += r.cells.filter(unknown).length;
    if (r.cells.some((c) => c.state === "degraded" || c.state === "blind" || c.state === "none" && !c.partial)) out.unhealthy += 1;
    const last = r.cells[r.cells.length - 1];
    if (last && last.state === "none" && !last.partial) out.silentToday += 1;
  }
  return out;
}

export { buildHealthMatrix, dayOf, healthOf, lastDays, matrixSummary, windowStart };
//# sourceMappingURL=healthModel.esm.js.map
