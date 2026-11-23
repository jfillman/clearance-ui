import { RESOLUTION_CAUSES, type Resolution, type ResolutionCause, type ResolutionState } from '../../kit';

// THE mapping from the Resolve panel's choices to the resolution state Clearance records (owner decision, board A-10 a,
// 2026-11-23). It is one table: changing what a choice records is changing one line here, and nothing else in the UI
// names a state for a choice. Every choice appends a resolution record (POST /v1/observations/{seq}/resolution); none
// removes or edits the exception, and the newest record about it is how it reads.
//
//   Revert                  -> reverted              a cause is required (why it was put back)
//   Adopt                   -> ratified              the change is accepted as the intended state
//   Accept with a reason    -> still-live            the change stays and the reason text is required
//   Declared break-glass    -> declared-break-glass  a person declares it was an emergency use (kept as a fourth choice)

export type ResolveChoiceId = 'revert' | 'adopt' | 'accept' | 'break-glass';

/** What a choice must carry besides its state: a `cause` (a Clearance cause), a `reason` (free text, sent as the note), or nothing. */
export type ResolveNeeds = 'cause' | 'reason' | null;

export interface ResolveChoice {
  id: ResolveChoiceId;
  label: string;
  /** The state the resolution record carries. */
  state: ResolutionState;
  needs: ResolveNeeds;
  /** One line under the choice, in the owner's words. */
  help: string;
}

export const RESOLVE_CHOICES: readonly ResolveChoice[] = [
  { id: 'revert', label: 'Revert', state: 'reverted', needs: 'cause', help: 'The change was put back. Say why it happened.' },
  { id: 'adopt', label: 'Adopt', state: 'ratified', needs: null, help: 'The change is the intended state: it is accepted as made.' },
  { id: 'accept', label: 'Accept with a reason', state: 'still-live', needs: 'reason', help: 'The change stays as it is for now. A reason is required.' },
  { id: 'break-glass', label: 'Declared break-glass', state: 'declared-break-glass', needs: null, help: 'It was an emergency use, declared by a person.' },
];

export const choiceById = (id: ResolveChoiceId): ResolveChoice => RESOLVE_CHOICES.find(c => c.id === id)!;

export interface ResolveInput {
  cause?: ResolutionCause | '';
  /** The reason for Accept, or an optional note for the others. */
  text?: string;
}

export type ResolveBody = { ok: true; body: Resolution } | { ok: false; missing: string };

/** The body to send for a choice, or what is still missing. Revert needs its cause, Accept its reason text; both are enforced here. */
export function resolutionFor(id: ResolveChoiceId, input: ResolveInput): ResolveBody {
  const choice = choiceById(id);
  const text = (input.text ?? '').trim();
  if (choice.needs === 'cause' && !(input.cause && (RESOLUTION_CAUSES as readonly string[]).includes(input.cause))) return { ok: false, missing: 'A reverted change needs its cause.' };
  if (choice.needs === 'reason' && !text) return { ok: false, missing: 'Accepting a change needs a reason.' };
  return {
    ok: true,
    body: { state: choice.state, ...(choice.needs === 'cause' && input.cause ? { cause: input.cause } : {}), ...(text ? { note: text } : {}) },
  };
}

/** The choice a recorded state came from, for words ("reverted" reads as Revert). */
export const choiceForState = (state: string | null | undefined): ResolveChoice | undefined => RESOLVE_CHOICES.find(c => c.state === state);
