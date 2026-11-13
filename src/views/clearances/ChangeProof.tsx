import { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import {
  Button,
  Callout,
  Chip,
  dateTime,
  EmptyNote,
  Fact,
  FactGrid,
  fontMono,
  fontScale,
  PanelSkeleton,
  Section,
  shortPrincipal,
  StatusChip,
  TabError,
  TextLink,
  tokensForTheme,
  Tooltip,
  useClearanceRead,
  usePoll,
  YamlBlock,
  type AttestationConfig,
  type Change,
  type ChangeAttestation,
  type ChangeOutcome,
  type ChangeRecordItem,
  type Page,
  type StatusTone,
  type VerifyAnswer,
  ReadError,
} from '../../kit';

// The proof behind a change (board C12): its history on the evidence chain, its outcome, and its signed attestation.
// Everything here is a read (clearance docs/clearance-api.md "Change history and attestations"). Two rules from the
// owner: "verified" is shown only from a server verify answer with `verified: true`; and a Clearance with no trust
// configured (`attestation-config.verifiable` false) shows "signed (recorded)" and says it cannot re-check it.

const useStyles = makeStyles<Theme>(theme => {
  const t = tokensForTheme(theme);
  return {
    pad: { padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 12 },
    chips: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
    actions: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
    timeline: { listStyle: 'none', margin: 0, padding: '4px 18px 8px', display: 'flex', flexDirection: 'column' },
    event: { display: 'grid', gridTemplateColumns: '88px 22px minmax(0, 1fr) auto', gap: 10, alignItems: 'start', padding: '8px 0', borderBottom: `1px solid ${t.lineSoft}` },
    when: { fontFamily: fontMono, fontSize: fontScale.sm, color: t.textLo },
    glyph: { width: 20, height: 20, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: fontMono, fontSize: fontScale.xs, border: `1px solid ${t.line}`, color: t.textLo },
    glyphOk: { borderColor: t.good, color: t.good },
    glyphBad: { borderColor: t.bad, color: t.bad },
    glyphWait: { borderColor: t.amber, color: t.amberText, borderStyle: 'dashed' },
    what: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
    detail: { fontSize: fontScale.sm, color: t.textLo, overflowWrap: 'anywhere' },
    code: { fontFamily: fontMono },
    raw: { gridColumn: '1 / -1' },
    selectable: { userSelect: 'text', fontFamily: fontMono, fontSize: fontScale.sm, overflowWrap: 'anywhere' },
  };
});

// ---- the states, as pure functions the tests pin

export type AttestationState = 'not-applicable' | 'waiting-for-clear' | 'waiting-for-outcome' | 'not-yet-signed' | 'not-attested' | 'signed';

/** Where a change is on the way to its attestation. A denied, expired or superseded change is never attested. */
export function attestationState(change: Pick<Change, 'state' | 'outcome' | 'attestation'>): AttestationState {
  if (change.attestation) return 'signed';
  if (change.state === 'holding') return 'waiting-for-clear';
  if (change.state !== 'cleared') return 'not-applicable';
  if (!change.outcome) return 'waiting-for-outcome';
  return change.outcome.applied && change.outcome.matched ? 'not-yet-signed' : 'not-attested';
}

/** The Rekor page of a log index, from the template the server gave (`{log_index}`), or undefined when it gave none. */
export function rekorUrl(config: Pick<AttestationConfig, 'rekor_entry_url'> | undefined, index: number | null | undefined): string | undefined {
  if (index === null || index === undefined || !config?.rekor_entry_url) return undefined;
  return config.rekor_entry_url.replace('{log_index}', String(index));
}

export type VerifyDisplay =
  | { kind: 'verified'; at: string; detail: string }
  | { kind: 'failed'; at: string; errors: string[] }
  | { kind: 'recorded'; note: string }
  | { kind: 'unchecked'; note: string };

export const NOT_VERIFIABLE_NOTE = 'This Clearance has no trust configured, so it cannot re-check the signature. The state shown is what the core recorded. Verify offline with the command below.';

/**
 * What to say about a signature. Verified only from a verify answer (or the last one, which a list row carries) with
 * `verified: true`; no trust configured is "signed (recorded)", never verified.
 */
export function verifyDisplay(args: { verifiable: boolean | undefined; answer?: VerifyAnswer; brief?: { verified: boolean; checked_at: string } | null }): VerifyDisplay {
  const { verifiable, answer, brief } = args;
  if (answer) {
    if (answer.verified === true) return { kind: 'verified', at: answer.checked_at, detail: [answer.mode, answer.key_id ?? answer.identity].filter(Boolean).join(' · ') };
    return { kind: 'failed', at: answer.checked_at, errors: answer.errors ?? [] };
  }
  if (brief) {
    return brief.verified === true ? { kind: 'verified', at: brief.checked_at, detail: '' } : { kind: 'failed', at: brief.checked_at, errors: [] };
  }
  if (verifiable === false) return { kind: 'recorded', note: NOT_VERIFIABLE_NOTE };
  return { kind: 'unchecked', note: 'Signed and recorded. Not re-checked yet.' };
}

export function VerifyChip({ display }: { display: VerifyDisplay }) {
  if (display.kind === 'verified') return <StatusChip tone="ok" title={`The server re-checked the signature at ${dateTime(display.at)}`}>verified</StatusChip>;
  if (display.kind === 'failed') return <StatusChip tone="bad" title={`The server's check failed at ${dateTime(display.at)}`}>verification failed</StatusChip>;
  return <StatusChip tone="neutral" title={display.note}>signed (recorded)</StatusChip>;
}

/** Fills a dashed digest: `sha256:abcd…1234`. */
export function shortDigest(d: string | null | undefined): string {
  if (!d) return '';
  if (d.length <= 24) return d;
  return `${d.slice(0, d.includes(':') ? 15 : 8)}…${d.slice(-4)}`;
}

/** A Rekor log index: a link to the public log when the server gave a template, the plain number when not, "none" when there is no entry. */
export function RekorIndex({ index, url }: { index: number | null | undefined; url?: string }) {
  if (index === null || index === undefined) return <>none</>;
  const text = index.toLocaleString('en-US');
  return url ? <TextLink href={url}>{text} ↗</TextLink> : <>{text}</>;
}

/** What the server's config says about re-checking: undefined until it answers, false when it did not (or has no trust). */
export function verifiableOf(config: { data?: AttestationConfig; loading: boolean }): boolean | undefined {
  if (config.data) return config.data.verifiable;
  return config.loading ? undefined : false;
}

/** The cursor to ask the next page with: the one a later page gave, else the first page's. */
export function cursorOf(later: number | null | undefined, first: unknown): number | null {
  if (later !== undefined) return later;
  return typeof first === 'number' ? first : null;
}

// ---- change history

const TOOL_TEXT: Record<string, { what: string; tone: 'ok' | 'bad' | 'warn' | 'plain' }> = {
  'deploy.request': { what: 'change registered', tone: 'ok' },
  'deploy.clear': { what: 'cleared', tone: 'ok' },
  'deploy.answer': { what: 'answered the waiting deployment', tone: 'ok' },
  'deploy.deny': { what: 'denied', tone: 'bad' },
  'deploy.revoke': { what: 'revoked: a new head replaced it', tone: 'warn' },
  'deploy.expire': { what: 'expired', tone: 'warn' },
  'deploy.exception': { what: 'applied with no grant', tone: 'bad' },
  'deploy.outcome': { what: 'outcome reported', tone: 'ok' },
  'deploy.attestation': { what: 'signed and logged', tone: 'ok' },
};

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** One line on what a record says: Clearance's own words (`result`, `reason`) when the record has them. */
export function recordDetail(item: ChangeRecordItem): string {
  const r = item.record ?? {};
  const att = (r.attestation ?? {}) as Record<string, unknown>;
  const parts: string[] = [];
  if (item.tool === 'deploy.attestation') {
    if (att.backend) parts.push(String(att.backend));
    if (att.rekor_log_index !== undefined && att.rekor_log_index !== null) parts.push(`Rekor log index ${att.rekor_log_index}`);
    if (att.outcome_seq !== undefined) parts.push(`binds outcome seq ${att.outcome_seq}`);
  }
  const said = str(r.result) || str(r.reason);
  if (said) parts.push(said);
  if (item.principal) parts.push(shortPrincipal(item.principal));
  return parts.join(' · ');
}

/** The pending step the history ends with, or undefined when nothing more is expected. */
export function nextStep(change: Pick<Change, 'state' | 'outcome' | 'attestation' | 'expires_at'>): { title: string; detail: string } | undefined {
  switch (attestationState(change)) {
    case 'waiting-for-clear':
      return { title: 'Holding for a person', detail: `Expires ${dateTime(change.expires_at)}.` };
    case 'waiting-for-outcome':
      return { title: 'Waiting for a deploy outcome', detail: 'The core signs after the first outcome that applied what was cleared.' };
    case 'not-yet-signed':
      return { title: 'Waiting for the signature', detail: 'The deploy applied what was cleared. The signer is retrying or attestation is off.' };
    default:
      return undefined;
  }
}

export function ChangeHistory({ change }: { change: Change }) {
  const c = useStyles();
  const api = useClearanceRead();
  const [extra, setExtra] = useState<ChangeRecordItem[]>([]);
  const [after, setAfter] = useState<number | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<number>();
  const first = usePoll(`change-records-${change.id}-${change.state}-${change.attestation ? 'a' : ''}`, () => api.get<Page<ChangeRecordItem>>(`/v1/clearances/${encodeURIComponent(change.id)}/records`, { limit: 100 }), 30_000);
  const items = [...(first.data?.items ?? []), ...extra];
  const next = cursorOf(after, first.data?.next);
  const more = async () => {
    if (next === null) return;
    setBusy(true);
    try {
      const page = await api.get<Page<ChangeRecordItem>>(`/v1/clearances/${encodeURIComponent(change.id)}/records`, { limit: 100, after: next });
      setExtra(prev => [...prev, ...page.items]);
      setAfter(typeof page.next === 'number' ? page.next : null);
    } finally {
      setBusy(false);
    }
  };
  const pending = nextStep(change);
  const glyphTone = { ok: c.glyphOk, bad: c.glyphBad, warn: '', plain: '' };
  const glyph = (i: number, tone: 'ok' | 'bad' | 'warn' | 'plain') => (
    <span className={`${c.glyph} ${glyphTone[tone]}`} aria-hidden>{i}</span>
  );
  return (
    <Section framed level={2} aria-label="Change history" title="Change history" meta={<span className={c.detail}>the change&apos;s records on the evidence chain</span>} count={first.data ? `${items.length} record${items.length === 1 ? '' : 's'}` : undefined}>
      {first.error && !first.data && <div className={c.pad}><TabError error={first.failure ?? first.error} what="the change history" onRetry={first.refresh} /></div>}
      {first.loading && !first.data && <PanelSkeleton rows={3} label="Loading the change history…" />}
      {first.data && items.length === 0 && <EmptyNote inset>No records for this change yet.</EmptyNote>}
      {(items.length > 0 || pending) && (
        <ol className={c.timeline}>
          {items.map((it, i) => {
            const t = TOOL_TEXT[it.tool] ?? { what: '', tone: 'plain' as const };
            const detail = recordDetail(it);
            return (
              <li key={it.seq} className={c.event}>
                <Tooltip title={dateTime(it.ts)}><span className={c.when}>{dateTime(it.ts).slice(5)}</span></Tooltip>
                {glyph(i + 1, t.tone)}
                <div className={c.what}>
                  <span><b className={c.code}>{it.tool}</b>{t.what && <> · {t.what}</>}</span>
                  {detail && <span className={c.detail}>{detail}</span>}
                </div>
                <TextLink expanded={open === it.seq} aria-label={`Record seq ${it.seq}`} title={it.hash} onClick={() => setOpen(open === it.seq ? undefined : it.seq)}>
                  seq {it.seq.toLocaleString('en-US')} · {it.hash.slice(0, 6)}…{it.hash.slice(-2)}
                </TextLink>
                {open === it.seq && (
                  <div className={c.raw}>
                    <YamlBlock text={JSON.stringify(it.record, null, 2)} aria-label={`Record ${it.seq}`} maxHeight={320} />
                  </div>
                )}
              </li>
            );
          })}
          {pending && (
            <li className={c.event}>
              <span className={c.when}>now</span>
              <span className={`${c.glyph} ${c.glyphWait}`} aria-hidden>{items.length + 1}</span>
              <div className={c.what}>
                <b>{pending.title}</b>
                <span className={c.detail}>{pending.detail}</span>
              </div>
              <span />
            </li>
          )}
        </ol>
      )}
      {next !== null && <div className={c.pad}><div className={c.actions}><Button small disabled={busy} onClick={more}>Load more records</Button></div></div>}
      <div className={c.pad}>
        <span className={c.detail}>Also recorded when they happen: deploy.revoke (a new head replaces a cleared change), deploy.expire (the TTL passes), deploy.exception (applied with no grant). Each shows here with its seq and hash.</span>
      </div>
    </Section>
  );
}

// ---- outcome

function noOutcomeText(state: Change['state']) {
  if (state === 'holding') return <>Nothing to show: the change has not been cleared. An outcome reported now would be recorded as <b>unattached: not cleared</b> and never attested.</>;
  if (state === 'cleared') return <>Not reported yet. The deploy reports an outcome when it applies what was cleared; the signer then attests it.</>;
  return <>None: a {state} change never deploys. An outcome reported for it would be recorded as <b>unattached: {state}</b>, and neither the change nor an attestation would follow.</>;
}

export function OutcomePanel({ change }: { change: Change }) {
  const c = useStyles();
  const o: ChangeOutcome | null | undefined = change.outcome;
  let body;
  if (!o) {
    const text = noOutcomeText(change.state);
    body = <Callout tone="neutral">{text}</Callout>;
  } else {
    body = (
      <>
        <div className={c.chips}>
          <StatusChip tone={o.applied ? 'ok' : 'bad'}>{o.applied ? 'applied' : 'not applied'}</StatusChip>
          <StatusChip tone={o.matched ? 'ok' : 'bad'}>{o.matched ? 'matched the cleared tree' : 'did not match the cleared tree'}</StatusChip>
          {o.exception !== undefined && o.exception !== null && <Chip tone="bad">exception seq {o.exception}</Chip>}
        </div>
        <FactGrid min={220}>
          <Fact label="When">{dateTime(o.at)}</Fact>
          {o.provider && <Fact label="Provider">{o.provider}</Fact>}
          {(o.digest || o.plan_digest) && <Fact label={o.plan_digest ? 'Plan digest' : 'Applied digest'}><span className={c.selectable}>{shortDigest(o.plan_digest ?? o.digest)}</span></Fact>}
          {o.release && <Fact label="Release"><span className={c.selectable}>{o.release}</span></Fact>}
          <Fact label="Record">seq {o.seq.toLocaleString('en-US')}{o.hash ? ` · ${o.hash.slice(0, 6)}…${o.hash.slice(-2)}` : ''}</Fact>
        </FactGrid>
        <span className={c.detail}>The provider reported this outcome. The core did not observe the target.</span>
        {!o.matched && <Callout tone="bad">The outcome did not match what was cleared. It is recorded as an exception, and no attestation follows.</Callout>}
      </>
    );
  }
  return (
    <Section framed level={2} aria-label="Outcome" title="Outcome">
      <div className={c.pad}>{body}</div>
    </Section>
  );
}

// ---- attestation

/** Saves `text` as a file the person keeps. */
export function saveAsFile(text: string, name: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function AttestationPanel({ change }: { change: Change }) {
  const c = useStyles();
  const api = useClearanceRead();
  const state = attestationState(change);
  const att: ChangeAttestation | null | undefined = change.attestation;
  const config = usePoll<AttestationConfig | undefined>('attestation-config', () => api.get<AttestationConfig>('/v1/attestation-config').catch(() => undefined), 0);
  const verifiable = verifiableOf(config);
  // A server verify answers only when this Clearance has trust configured; 404 otherwise, which is "recorded", not an error.
  const verify = usePoll<VerifyAnswer | undefined>(
    `attestation-verify-${change.id}-${att?.digest ?? ''}-${verifiable}`,
    () => (att && verifiable ? api.get<VerifyAnswer>(`/v1/clearances/${encodeURIComponent(change.id)}/attestation/verify`).catch(e => (e instanceof ReadError && e.status === 404 ? undefined : Promise.reject(e))) : Promise.resolve(undefined)),
    0,
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const download = async () => {
    setSaving(true);
    setSaveError(undefined);
    try {
      saveAsFile(await api.getText(`/v1/clearances/${encodeURIComponent(change.id)}/attestation`), `attestation-${change.id}.json`);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  const subtitle = <span className={c.detail}>signed statement about this change</span>;
  let body;
  if (state === 'signed' && att) {
    const display = verifyDisplay({ verifiable, answer: verify.data, brief: att.verification });
    const url = rekorUrl(config.data, att.rekor_log_index);
    const commands = (config.data?.verify_commands ?? []).join('\n');
    body = (
      <>
        <div className={c.chips}>
          <VerifyChip display={display} />
          {att.rekor_log_index !== null && <Chip>logged in Rekor</Chip>}
          <Chip>backend: {att.backend}</Chip>
        </div>
        <span className={c.detail}>Signed {dateTime(att.created_at)}.{display.kind === 'verified' ? ` Re-checked by Clearance at ${dateTime(display.at)}${display.detail ? ` (${display.detail})` : ''}.` : ''}</span>
        {display.kind === 'recorded' && <Callout tone="info">{display.note}</Callout>}
        {display.kind === 'failed' && (
          <Callout tone="bad" title="The signature did not verify">
            {display.errors.length ? display.errors.join('; ') : 'Clearance reported verified: false.'}
          </Callout>
        )}
        {verify.error && !verify.data && <Callout tone="warn">The check could not run: {verify.error}</Callout>}
        <FactGrid min={220}>
          <Fact label="DSSE digest"><span className={c.selectable}>{att.digest}</span></Fact>
          <Fact label="Key id"><span className={c.selectable}>{att.key_id || 'keyless'}</span></Fact>
          <Fact label="Rekor log index"><RekorIndex index={att.rekor_log_index} url={url} /></Fact>
          {att.rekor_uuid && <Fact label="Rekor uuid"><span className={c.selectable}>{att.rekor_uuid}</span></Fact>}
          <Fact label="Binds outcome">seq {att.outcome_seq.toLocaleString('en-US')}</Fact>
          <Fact label="Attestation record">seq {att.record_seq.toLocaleString('en-US')}</Fact>
        </FactGrid>
        <Callout tone="info" label="What this proves">
          Clearance cleared exactly this manifest tree ({shortDigest(change.tree_digest)}) under policy {change.policy_version}{change.repo_policy_digest ? ' and clearance.yaml' : ''}, and a deploy reported applying it, signed{att.rekor_log_index !== null ? ' and logged' : ''} at {dateTime(att.created_at)}. It does not prove what the cluster looks like now.
        </Callout>
        {commands && (
          <div>
            <YamlBlock title="Verify it yourself, offline" text={commands} aria-label="Offline verify command" maxHeight={200} />
            <span className={c.detail}>Download the bundle first. Placeholders in angle brackets come from your trust root; tools that read a Sigstore bundle read the same file.</span>
          </div>
        )}
        <div className={c.actions}>
          <Button variant="primary" disabled={saving} onClick={download}>Download bundle</Button>
          {verifiable && <Button disabled={verify.loading} onClick={verify.refresh}>Verify again</Button>}
        </div>
        {saveError && <Callout tone="bad">{saveError}</Callout>}
      </>
    );
  } else {
    const [chip, tone, text]: [string, StatusTone, string] = {
      'waiting-for-clear': ['not applicable yet', 'neutral', 'An attestation follows clearing and an applied deploy. Nothing is signed for a holding change.'],
      'waiting-for-outcome': ['not yet signed', 'warn', 'Cleared, and no deploy outcome has been reported. The core signs after the first outcome that applied what was cleared.'],
      'not-yet-signed': ['not yet signed', 'warn', 'The deploy applied what was cleared and no attestation is stored yet: the signer is waiting or retrying, or attestation is off for this Clearance. It appears here when signed.'],
      'not-attested': ['not attested', 'bad', 'The outcome did not apply or did not match the cleared tree, so nothing is signed. The mismatch is an exception on the evidence chain.'],
      'not-applicable': ['not applicable', 'neutral', 'Denied changes are never attested, and neither are expired or superseded ones, changes in exception, or outcomes that did not match the cleared tree.'],
      signed: ['signed', 'ok', ''],
    }[state] as [string, StatusTone, string];
    body = (
      <>
        <div className={c.chips}><StatusChip tone={tone} dot={tone === 'warn'}>{chip}</StatusChip></div>
        <Callout tone={tone === 'bad' || tone === 'warn' ? tone : 'neutral'}>{text}</Callout>
      </>
    );
  }
  return (
    <Section framed level={2} aria-label="Attestation" title="Attestation" meta={subtitle}>
      <div className={c.pad}>{body}</div>
    </Section>
  );
}

/** History, outcome and attestation: the proof behind one change. */
export function ChangeProof({ change }: { change: Change }) {
  return (
    <>
      <ChangeHistory change={change} />
      <OutcomePanel change={change} />
      <AttestationPanel change={change} />
    </>
  );
}
