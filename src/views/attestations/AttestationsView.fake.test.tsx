import { act, render, screen, within } from '@testing-library/react';
import { ClearanceTransportProvider, createFakeTransport } from '../../kit';
import { AttestationsView } from './AttestationsView';

// A view under the fake transport: no Backstage API, no fetch, no mock of any @backstage module. This is the shape of
// a view test in a standalone host.

const NOW = Date.parse('2026-11-12T20:00:00Z');
const row = {
  change_id: 'ch-1', app: 'gate-api', env: 'prod', cluster: 'hangar-prod', release_id: 'rel-1', tree_digest: `sha256:${'c'.repeat(64)}`,
  signed_at: '2026-11-12T19:00:00Z', digest: `sha256:${'d'.repeat(64)}`, backend: 'keyless', key_id: 'key-a', rekor_log_index: 1001, rekor_uuid: 'u', outcome_seq: 1, record_seq: 101, verification: null,
};

it('renders the rows the transport serves and asks with the query it was given', async () => {
  const transport = createFakeTransport(({ path }) => {
    if (path === '/v1/attestation-config') return { verifiable: true, modes: ['keyless'], rekor_url: 'https://rekor.example', rekor_entry_url: 'https://rekor.example/e/{log_index}', key_ids: ['key-a'], verify_commands: [] };
    if (path === '/v1/clearances/counts') return { items: [], total: 0 };
    if (path === '/v1/attestations') return { items: [row], next: null };
    return undefined;
  });
  await act(async () => {
    render(
      <ClearanceTransportProvider transport={transport}>
        <AttestationsView now={NOW} />
      </ClearanceTransportProvider>,
    );
  });
  const rows = within(screen.getByRole('table', { name: 'Signed attestations' })).getAllByRole('row').slice(1);
  expect(rows).toHaveLength(1);
  expect(rows[0].textContent).toContain('ch-1');
  expect(transport.calls.every(c => c.method === 'GET')).toBe(true);
  expect(transport.calls.some(c => c.path === '/v1/attestations')).toBe(true);
});
