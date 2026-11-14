import { useEffect, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import {
  Button,
  Callout,
  Chip,
  dateTime,
  Fact,
  FactGrid,
  PanelSkeleton,
  ReadError,
  Section,
  TextLink,
  useClearanceRead,
  usePoll,
  YamlBlock,
  type AttestationConfig,
  type AttestationRow,
  type Change,
  type VerifyAnswer,
} from '../../kit';
import { ChangeHistory, RekorIndex, rekorUrl, saveAsFile, verifiableOf, verifyDisplay, VerifyChip } from '../clearances/ChangeProof';
import { decodeAttestation, limitations, predicateRows, type DecodedAttestation } from './bundle';

// An attestation, opened under its row (board C13): the in-toto statement decoded from the DSSE bundle, who signed it,
// the Rekor entry, whether the server's verify says it holds, the change's history, the bundle and the offline command.
// "verified" comes only from GET .../attestation/verify; with no trust configured the state is "signed (recorded)".

const useStyles = makeStyles<Theme>(() => ({
  stack: { display: 'flex', flexDirection: 'column', gap: 16, padding: 12 },
  pad: { padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 12 },
  chips: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  actions: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' },
  selectable: { userSelect: 'text', overflowWrap: 'anywhere' },
  list: { margin: 0, paddingLeft: 18 },
}));

export function AttestationDetail({ row, onOpenChange }: { row: AttestationRow; onOpenChange?: (changeId: string) => void }) {
  const c = useStyles();
  const api = useClearanceRead();
  const id = encodeURIComponent(row.change_id);
  const config = usePoll<AttestationConfig | undefined>('attestation-config', () => api.get<AttestationConfig>('/v1/attestation-config').catch(() => undefined), 0);
  const verifiable = verifiableOf(config);
  const change = usePoll<Change | undefined>(`clearance-${row.change_id}`, () => api.get<Change>(`/v1/clearances/${id}`).catch(() => undefined), 30_000);
  const verify = usePoll<VerifyAnswer | undefined>(
    `attestation-verify-${row.change_id}-${row.digest}-${verifiable}`,
    () => (verifiable ? api.get<VerifyAnswer>(`/v1/clearances/${id}/attestation/verify`).catch(e => (e instanceof ReadError && e.status === 404 ? undefined : Promise.reject(e))) : Promise.resolve(undefined)),
    0,
  );
  const [bundle, setBundle] = useState<{ text: string; decoded?: DecodedAttestation; error?: string }>();
  const [saveError, setSaveError] = useState<string>();
  useEffect(() => {
    let live = true;
    setBundle(undefined);
    api.getText(`/v1/clearances/${id}/attestation`).then(
      t => {
        if (!live) return;
        try {
          setBundle({ text: t, decoded: decodeAttestation(t) });
        } catch (e) {
          setBundle({ text: t, error: e instanceof Error ? e.message : String(e) });
        }
      },
      e => live && setBundle({ text: '', error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
  }, [api, id, row.digest]);

  const d = bundle?.decoded;
  const display = verifyDisplay({ verifiable, answer: verify.data, brief: row.verification });
  const index = d?.tlog[0]?.logIndex ?? row.rekor_log_index;
  const integrated = d?.tlog[0]?.integratedTime ?? verify.data?.rekor.integrated_time ?? undefined;
  const url = rekorUrl(config.data, index);
  const commands = (config.data?.verify_commands ?? []).join('\n');
  const keyId = verify.data?.key_id ?? d?.keyHint ?? row.key_id;
  const identity = verify.data?.identity ?? config.data?.identity;
  const issuer = verify.data?.issuer ?? config.data?.issuer;
  const keyless = d ? d.signerKind === 'certificate' : !row.key_id;
  const download = () => {
    if (!bundle?.text) return;
    try {
      saveAsFile(bundle.text, `attestation-${row.change_id}.json`);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  };
  const rows = d ? predicateRows(d) : [];
  const said = d ? limitations(d) : [];
  const first = d?.subject[0];

  return (
    <div className={c.stack}>
      <Section framed aria-label="Attestation detail" title={`${row.app} · ${row.env}`} meta={<VerifyChip display={display} />} count={<span className={c.selectable}>{row.change_id}</span>}>
        <div className={c.pad}>
          <div className={c.chips}>
            <Chip>backend: {row.backend}</Chip>
            {index !== null && index !== undefined && <Chip>logged in Rekor</Chip>}
          </div>
          {display.kind === 'verified' && <Callout tone="ok">Clearance re-checked the signature at {dateTime(display.at)}{display.detail ? ` (${display.detail})` : ''}.</Callout>}
          {display.kind === 'recorded' && <Callout tone="info">{display.note}</Callout>}
          {display.kind === 'failed' && (
            <Callout tone="bad" title="The signature did not verify">
              {display.errors.length ? display.errors.join('; ') : 'Clearance reported verified: false.'}
            </Callout>
          )}
          {verify.error && !verify.data && <Callout tone="warn">The check could not run: {verify.error}</Callout>}
        </div>
      </Section>

      <Section framed level={2} aria-label="Signed statement" title="Signed statement" meta={<span className={c.selectable}>in-toto, decoded from the DSSE bundle</span>}>
        <div className={c.pad}>
          {!bundle && <PanelSkeleton rows={3} label="Loading the bundle…" />}
          {bundle?.error && <Callout tone="bad" title="The bundle could not be read">{bundle.error}</Callout>}
          {d && (
            <>
              <FactGrid min={260}>
                <Fact label="Payload type"><span className={c.selectable}>{d.payloadType || '—'}</span></Fact>
                <Fact label="Predicate type"><span className={c.selectable}>{d.predicateType || '—'}</span></Fact>
                {first && <Fact label="Subject"><span className={c.selectable}>{first.name}</span></Fact>}
                {first && Object.entries(first.digest).map(([alg, v]) => <Fact key={alg} label={`Subject digest (${alg})`}><span className={c.selectable}>{v}</span></Fact>)}
              </FactGrid>
              <FactGrid min={260}>
                {rows.map(r => <Fact key={r.label} label={r.label}><span className={c.selectable}>{r.value}</span></Fact>)}
              </FactGrid>
              {said.length > 0 && (
                <Callout tone="info" label="What this does not establish">
                  <ul className={c.list}>{said.map(l => <li key={l}>{l}</li>)}</ul>
                </Callout>
              )}
            </>
          )}
        </div>
      </Section>

      <Section framed level={2} aria-label="Signer and log entry" title="Signer and log entry">
        <div className={c.pad}>
          <FactGrid min={260}>
            <Fact label="Signed">{dateTime(row.signed_at)}</Fact>
            {keyless ? (
              <>
                <Fact label="Signer">keyless (Fulcio certificate in the bundle)</Fact>
                {identity && <Fact label="Certificate identity"><span className={c.selectable}>{identity}</span></Fact>}
                {issuer && <Fact label="Certificate issuer"><span className={c.selectable}>{issuer}</span></Fact>}
              </>
            ) : (
              <Fact label="Key id"><span className={c.selectable}>{keyId || '—'}</span></Fact>
            )}
            <Fact label="Rekor log index">{index === null || index === undefined ? 'not logged' : <RekorIndex index={index} url={url} />}</Fact>
            {integrated && <Fact label="Log integrated">{dateTime(integrated)}</Fact>}
            {row.rekor_uuid && <Fact label="Rekor uuid"><span className={c.selectable}>{row.rekor_uuid}</span></Fact>}
            <Fact label="DSSE digest"><span className={c.selectable}>{row.digest}</span></Fact>
          </FactGrid>
          {keyless && !verify.data && (identity || issuer) && <span className={c.selectable}>The identity shown is the one this Clearance trusts; the server verify confirms the certificate matches it.</span>}
        </div>
      </Section>

      {change.data ? <ChangeHistory change={change.data} /> : <PanelSkeleton rows={2} label="Loading the change history…" />}

      <Section framed level={2} aria-label="Verify and download" title="Verify it yourself">
        <div className={c.pad}>
          {commands && <YamlBlock title="Offline verify command" text={commands} aria-label="Offline verify command" maxHeight={200} />}
          <div className={c.actions}>
            <Button variant="primary" disabled={!bundle?.text} onClick={download}>Download bundle</Button>
            {verifiable && <Button disabled={verify.loading} onClick={verify.refresh}>Verify again</Button>}
            {onOpenChange && <TextLink onClick={() => onOpenChange(row.change_id)}>Open the change in Clearances</TextLink>}
          </div>
          {saveError && <Callout tone="bad">{saveError}</Callout>}
        </div>
      </Section>
    </div>
  );
}
