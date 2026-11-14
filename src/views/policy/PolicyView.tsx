import { useMemo, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import {
  Button,
  Chip,
  ColumnLabel,
  Count,
  DecisionChip,
  ExpandRow,
  Field,
  FilterBar,
  FilterChips,
  Hint,
  PanelSkeleton,
  Section,
  StatusChip,
  TabError,
  TierChip,
  useClearanceRead,
  useClearanceTokens,
  useInputClass,
  useMountedNow,
  usePoll,
  useTableKit,
  type AgentDefinitionView,
  type StatusTone,
} from '../../kit';

// Policy (board C3): the deny rules in evaluation order with their 7-day hits and pack, the tool registry, and
// "would this be allowed?", a dry run of the real policy (GET /v1/policy/explain; nothing recorded). Read-only: a
// rule change is a Clearance release, a definition change is a PR.

export interface PolicyRule {
  id: string;
  name: string;
  expression: string;
  message: string;
  hint: string;
  order: number;
  pack: string;
}
export interface PolicyTool {
  name: string;
  tier: string;
  summary: string;
  required_args: string[];
  target: string;
  propose_only: boolean;
  writes_files: boolean;
  github_cost: number;
}
export interface PolicyDoc {
  rules: PolicyRule[];
  tools: PolicyTool[];
  packs: string[];
}
export interface Explanation {
  agent: string;
  tool: string;
  known_tool: boolean;
  decision: { allow: boolean; rule: string | null; name: string | null; message: string; hint: string; tier: number | null };
  path: Array<{ id: string; name: string; order: number; matched: boolean | null; error: boolean }>;
  all_rules: Array<{ id: string; name: string; matched: boolean | null; error: boolean }>;
  dry_run: true;
}

type Sub = 'rules' | 'tools';
const WEEK_MS = 7 * 86_400_000;

// Layout only: every look is the kit's.
const useStyles = makeStyles<Theme>(() => ({
  row: { display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' },
  scroll: { overflowX: 'auto' },
  pad: { padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 10 },
  path: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' },
  verdict: { display: 'flex', flexDirection: 'column', gap: 6 },
  ruleDetail: { display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 18px' },
  run: { alignSelf: 'flex-start' },
}));

export function PolicyView({ now: nowProp }: { now?: number }) {
  const t = useClearanceTokens();
  const c = useStyles();
  const tk = useTableKit();
  const api = useClearanceRead();
  // Fixed at mount: `since` is the hits poll's key, and a key that moved every render re-polled every render.
  const now = useMountedNow(nowProp);
  const [sub, setSub] = useState<Sub>('rules');
  const [open, setOpen] = useState<string>();
  const policy = usePoll('policy', () => api.get<PolicyDoc>('/v1/policy'), 300_000);
  const since = useMemo(() => new Date(now - WEEK_MS).toISOString(), [now]);
  const hits = usePoll(`hits-${since}`, () => api.get<{ items: Array<{ key: string; count: number }> }>('/v1/evidence/counts', { by: 'rule', decision: 'deny', since }), 60_000);
  const hitsByRule = useMemo(() => new Map((hits.data?.items ?? []).map(i => [i.key, i.count])), [hits.data]);
  const rules = policy.data?.rules ?? [];
  const tools = policy.data?.tools ?? [];

  return (
    <>
      <FilterBar>
        <FilterChips
          label="Policy sections"
          hideLabel
          options={[{ id: 'rules' as Sub, label: 'Runtime rules', count: rules.length || undefined }, { id: 'tools' as Sub, label: 'Tool registry', count: tools.length || undefined }]}
          value={sub}
          onChange={setSub}
        />
      </FilterBar>
      {policy.error && !policy.data && <div style={{ marginBottom: 12 }}><TabError error={policy.error} what="the policy" onRetry={policy.refresh} /></div>}
      <div className={c.row}>
        {sub === 'rules' ? (
          <Section framed aria-label="Deny rules" title="Deny rules, in evaluation order" meta={<Count>CEL · first match denies · an expression that fails to evaluate denies (R000)</Count>} count={`hits, 7 days${hits.data ? '' : ' …'}`} style={{ flex: '1.5 1 600px' }}>
            {policy.loading && !policy.data && <PanelSkeleton rows={4} label="Loading…" />}
            {rules.length > 0 && (
              <div className={c.scroll}>
                <table className={tk.table}>
                  <thead><tr><th className={tk.th}>Rule</th><th className={tk.th}>Name</th><th className={tk.th}>Denies when</th><th className={tk.th}>Source</th><th className={tk.th}>Hits</th></tr></thead>
                  <tbody>
                    {rules.map(r => {
                      const n = hitsByRule.get(r.id) ?? 0;
                      const isOpen = open === r.id;
                      return (
                        <ExpandRow key={r.id} id={`rule-${r.id}`} open={isOpen} onToggle={() => setOpen(isOpen ? undefined : r.id)} colSpan={5} label={`Rule ${r.id} detail`} details={<div className={c.ruleDetail}><Hint><b>Message</b> {r.message}</Hint><Hint><b>Hint to the agent</b> {r.hint}</Hint></div>}>
                          <td className={tk.td}><Chip>{r.id}</Chip></td>
                          <td className={tk.td}>{r.name}</td>
                          <td className={tk.td}><span className={tk.meta}>{r.expression}</span></td>
                          <td className={tk.td}><Chip tone={r.pack === 'core' ? 'neutral' : 'sky'}>{r.pack}</Chip></td>
                          <td className={tk.td}><span className={tk.meta} style={{ color: n ? t.amberText : t.textFaint }}>{n}</span></td>
                        </ExpandRow>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        ) : (
          <Section framed aria-label="Tool registry" title="Tool registry" meta={<Count>what an agent may be granted; the tier is the authority a call needs</Count>} count={`${tools.length} tools`} style={{ flex: '1.5 1 600px' }}>
            {tools.length > 0 && (
              <div className={c.scroll}>
                <table className={tk.table}>
                  <thead><tr><th className={tk.th}>Tool</th><th className={tk.th}>Tier</th><th className={tk.th}>What it does</th><th className={tk.th}>Needs</th><th className={tk.th}>Acts on</th></tr></thead>
                  <tbody>
                    {tools.map(tool => (
                      <tr key={tool.name}>
                        <td className={tk.td}><Chip>{tool.name}</Chip></td>
                        <td className={tk.td}><TierChip tier={tool.tier as any} /></td>
                        <td className={tk.td}>{tool.summary}{tool.propose_only && <div className={tk.meta}>propose only: a person merges</div>}</td>
                        <td className={tk.td}><span className={tk.meta}>{tool.required_args.join(', ') || '—'}</span></td>
                        <td className={tk.td}><span className={tk.meta}>{tool.target === 'none' ? '—' : tool.target}{tool.github_cost ? ` · ${tool.github_cost} GitHub calls` : ''}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        )}
        <Explainer rules={rules} tools={tools} />
      </div>
    </>
  );
}

function Explainer({ rules, tools }: { rules: PolicyRule[]; tools: PolicyTool[] }) {
  const c = useStyles();
  const inp = useInputClass();
  const api = useClearanceRead();
  const agents = usePoll('agents', () => api.get<{ items: AgentDefinitionView[] }>('/v1/agents'), 300_000);
  const [agent, setAgent] = useState('');
  const [tool, setTool] = useState('');
  const [args, setArgs] = useState('{}');
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Explanation>();
  const [error, setError] = useState<string>();
  const names = useMemo(() => new Map(rules.map(r => [r.id, r.name])), [rules]);
  let argsError: string | undefined;
  try {
    const parsed = JSON.parse(args || '{}');
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) argsError = 'args must be a JSON object';
  } catch {
    argsError = 'args is not valid JSON';
  }
  const run = async () => {
    setBusy(true);
    setError(undefined);
    try {
      setOut(await api.get<Explanation>('/v1/policy/explain', { agent, tool, args }));
    } catch (e) {
      setOut(undefined);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section framed aria-label="Would this be allowed?" title="Would this be allowed?" meta={<Count>dry-runs the real policy on a fresh session · records nothing</Count>} style={{ flex: '1 1 360px' }}>
      <div className={c.pad}>
        <Field label="Agent">
          {({ className }) => (
            <select className={className} value={agent} onChange={e => setAgent(e.target.value)}>
              <option value="">choose an agent</option>
              {(agents.data?.items ?? []).map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
            </select>
          )}
        </Field>
        <Field label="Tool">
          {({ className }) => (
            <select className={className} value={tool} onChange={e => setTool(e.target.value)}>
              <option value="">choose a tool</option>
              {tools.map(x => <option key={x.name} value={x.name}>{x.tier} {x.name}</option>)}
            </select>
          )}
        </Field>
        <Field label="Args (JSON)">
          {({ className }) => <textarea className={`${className} ${inp.textarea}`} value={args} onChange={e => setArgs(e.target.value)} spellCheck={false} />}
        </Field>
        {argsError && <span className={inp.problem}>{argsError}</span>}
        <Button variant="primary" className={c.run} onClick={run} disabled={busy || !agent || !tool || !!argsError}>
          {busy ? 'Running…' : 'Run dry run'}
        </Button>
        {error && <span className={inp.problem}>{error}</span>}
        {out && (
          <div className={c.verdict} aria-live="polite">
            <div className={c.path}><DecisionChip decision={out.decision.allow ? 'allow' : 'deny'} rule={out.decision.rule} />{out.decision.name && <Count>{out.decision.name}</Count>}{!out.known_tool && <StatusChip tone="warn">unknown tool</StatusChip>}</div>
            {!out.decision.allow && <span>{out.decision.message}</span>}
            {out.decision.hint && <Hint>Hint: {out.decision.hint}</Hint>}
            <ColumnLabel>Path through the rules</ColumnLabel>
            <div className={c.path}>
              {out.path.map(r => {
                let tone: StatusTone = 'neutral';
                let verdict = 'passed';
                if (r.error) [tone, verdict] = ['warn', 'failed to evaluate'];
                else if (r.matched) [tone, verdict] = ['bad', 'matched'];
                return <StatusChip key={r.id} tone={tone} title={`${r.name}: ${verdict}`}>{r.id}</StatusChip>;
              })}
              <Count>{out.decision.allow ? `${out.path.length} rules, none matched` : `${out.path.length} rules to the first match (${names.get(out.decision.rule ?? '') ?? out.decision.rule})`}</Count>
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}
