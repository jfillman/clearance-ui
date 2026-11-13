import { useMemo } from 'react';
import { TransportError, useClearanceTransport } from './transport';
import type { BulkResolutionRecorded, Change, Resolution, ResolutionRecorded } from './types';

// The person controls (clearance control.py, decided 2026-10-31: the delegate model for writes too), through the
// clearance backend (/api/clearance/v1/...), which calls Clearance's gateway as itself naming the signed-in person.
// Clearance decides who may and records each as evidence. A refusal comes back as its {error, rule, hint}.

export interface ControlRefusal {
  status: number;
  error: string;
  rule?: string;
  hint?: string;
}

export class ControlError extends Error {
  constructor(readonly refusal: ControlRefusal) {
    super(refusal.hint ? `${refusal.error} (${refusal.hint})` : refusal.error);
  }
}

export interface ClearanceWrite {
  /** Trip the session's breaker: every further call of the run is refused; it stays to be read. */
  freeze(sessionId: string, reason: string): Promise<{ session: string; tripped: boolean; trip_reason: string }>;
  /** Close the session and its children. */
  end(sessionId: string, reason: string): Promise<{ session: string; closed: boolean }>;
  /** Hold the agent's triggers for `hours` (24 by default, 336 at most); renewing replaces the hold. */
  hold(agent: string, reason: string, hours?: number): Promise<Hold>;
  /** Lift a hold early. */
  release(agent: string): Promise<{ agent: string; released: boolean }>;
  /** Clear a change holding for people (the deployment gate): one approval in the role the person qualifies for. */
  clearChange(id: string): Promise<Change>;
  /** Deny a change holding for people, with a reason. */
  denyChange(id: string, reason: string): Promise<Change>;
  /** Run a task agent in-cluster as the signed-in person (clearance v0.23.0): a session and an AgentRun with `input`. */
  runAgent(agent: string, input?: string): Promise<AgentRunStarted>;
  /** An admin's resolution of an observed change (O-5), on the Clearance core: append-only, the newest wins. */
  resolveObservation(seq: number, resolution: Resolution): Promise<ResolutionRecorded>;
  /** The same for up to BULK_RESOLUTION_LIMIT items at once: one record each, one batch id, skips reported per item. */
  resolveObservations(items: number[], resolution: Resolution): Promise<BulkResolutionRecorded>;
}

/** The most items one bulk resolution call takes; a larger selection goes in chunks of this size. */
export const BULK_RESOLUTION_LIMIT = 200;

/** What POST /v1/agents/{name}/runs answers: the person's session, the AgentRun and the task. */
export interface AgentRunStarted {
  agent: string;
  session: string;
  run: string | null;
  task_id: string;
}

/** The active hold on an agent's triggers, as /v1/agents carries it. */
export interface Hold {
  agent: string;
  by: string;
  via: string | null;
  reason: string;
  since: string;
  until: string;
}

export function useClearanceWrite(): ClearanceWrite {
  const transport = useClearanceTransport();
  return useMemo(() => {
    async function send<T>(method: 'POST' | 'DELETE', path: string, body?: Record<string, unknown>): Promise<T> {
      try {
        return method === 'DELETE' ? await transport.delete<T>(path) : await transport.post<T>(path, body);
      } catch (e) {
        if (e instanceof TransportError) {
          const out = e.body;
          throw new ControlError({ status: e.status, error: out?.error ?? `${path} failed with ${e.status}`, rule: out?.rule, hint: out?.hint });
        }
        throw e;
      }
    }
    return {
      freeze: (id, reason) => send('POST', `/v1/sessions/${encodeURIComponent(id)}/freeze`, { reason }),
      end: (id, reason) => send('POST', `/v1/sessions/${encodeURIComponent(id)}/end`, { reason }),
      hold: (agent, reason, hours) => send('POST', `/v1/agents/${encodeURIComponent(agent)}/hold`, hours === undefined ? { reason } : { reason, hours }),
      release: agent => send('DELETE', `/v1/agents/${encodeURIComponent(agent)}/hold`),
      clearChange: id => send('POST', `/v1/clearances/${encodeURIComponent(id)}/clear`, {}),
      denyChange: (id, reason) => send('POST', `/v1/clearances/${encodeURIComponent(id)}/deny`, { reason }),
      resolveObservation: (seq, resolution) => send('POST', `/v1/observations/${encodeURIComponent(String(seq))}/resolution`, { ...resolution }),
      resolveObservations: (items, resolution) => send('POST', '/v1/observations/resolutions', { items, ...resolution }),
      runAgent: (agent, input) => send('POST', `/v1/agents/${encodeURIComponent(agent)}/runs`, input ? { input } : {}),
    };
  }, [transport]);
}
