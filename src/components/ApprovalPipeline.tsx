import { format } from 'date-fns';
import { CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TicketAction, TicketStatus, TicketType } from '@/lib/types';

export type PipelineStep = { status: string; label: string; who: string };

/** The approval chain every ticket walks. `who` doubles as the role hint used
 *  when an audit row's status is ambiguous ('Approved' is written by the
 *  warehouse, the Line Manager *and* the Director — see stepIndexForAction). */
export const PIPELINE: PipelineStep[] = [
  { status: 'pending', label: 'Submitted', who: 'Staff' },
  { status: 'reviewed', label: 'Review & Book', who: 'Warehouse' },
  { status: 'lm_approved', label: 'Approve', who: 'Line Manager' },
  { status: 'finalized', label: 'Finalize', who: 'Director / Admin' },
];

/** Borrow tickets get a 5th step: the warehouse records the return. */
export const RETURNED_STEP: PipelineStep = { status: 'returned', label: 'Returned', who: 'Warehouse' };

export const pipelineSteps = (type: TicketType): PipelineStep[] =>
  type === 'borrow' ? [...PIPELINE, RETURNED_STEP] : PIPELINE;

/** stepIndexForAction result for a rejected / recalled row (chain stopped). */
export const STOPPED = -2;

const norm = (s?: string | null) => String(s || '').trim().toLowerCase().replace(/\s+/g, '_');

const fmtDateTime = (iso?: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : format(d, 'MMM d, yyyy h:mm a');
};

/** Which pipeline step an actor's role points at (-1 when unknown). */
function stepIndexByRole(role: string | null | undefined, steps: PipelineStep[]): number {
  const base = norm(role).split('_')[0];
  if (!base) return -1;
  return steps.findIndex((s) => norm(s.who).includes(base));
}

/** Step of an audit row: -2 = rejected/recalled (chain stopped), -1 = not a step. */
export function stepIndexForAction(a: TicketAction, steps: PipelineStep[]): number {
  const s = norm(a.status);
  const act = norm(a.action);
  const has = (...tokens: string[]) =>
    tokens.some((t) => s === t || act === t || s.startsWith(t) || act.startsWith(t));

  if (has('reject', 'recall')) return STOPPED;
  const returned = steps.findIndex((st) => st.status === 'returned');
  if (returned >= 0 && has('return')) return returned;
  if (has('pending', 'create', 'created', 'submit')) return 0;
  if (has('moved', 'review', 'book')) return 1;
  if (has('lm_approved')) return 2;
  if (has('finaliz')) return 3;
  if (has('approved')) {
    // Ambiguous legacy label — the actor's role decides.
    const role = norm(a.role);
    if (role === 'director' || role === 'admin') return 3;
    if (role === 'line_manager') return 2;
    if (role === 'warehouse') return 1;
    return 2;
  }
  return stepIndexByRole(a.role, steps);
}

/** Earliest timestamp per step (step 0 falls back to the ticket's createdAt). */
export function stepTimesFromActions(
  steps: PipelineStep[],
  actions: TicketAction[] = [],
  createdAt?: string | null,
): (string | null)[] {
  const out: (string | null)[] = steps.map(() => null);
  if (createdAt) out[0] = createdAt;
  for (const a of actions) {
    const i = stepIndexForAction(a, steps);
    if (i < 0 || i >= steps.length || !a.actionAt) continue;
    const at = String(a.actionAt);
    if (!out[i] || at < out[i]!) out[i] = at;
  }
  return out;
}

/**
 * Read-only stepper of the approval chain.
 *   • `status` drives the highlight; terminal `rejected` / `recalled` tickets
 *     show the reached steps as done and a rose ✕ on the step that stopped it.
 *   • Pass `actions` (the ticket_actions trail) to show when each step happened
 *     — the Action Center omits it, so its rendering stays byte-identical.
 */
export function ApprovalPipeline({
  status, type = 'request', steps, createdAt, actions, className,
}: {
  status: TicketStatus;
  type?: TicketType;
  /** Override the default chain (rarely needed). */
  steps?: PipelineStep[];
  createdAt?: string | null;
  /** Audit rows — when given, each step shows when it happened. */
  actions?: TicketAction[];
  className?: string;
}) {
  const chain = steps ?? pipelineSteps(type);
  const times = stepTimesFromActions(chain, actions, createdAt);
  const idx = chain.findIndex((s) => s.status === status);
  const stopped = idx < 0; // rejected / recalled / unknown
  const reached = times.reduce((acc, t, i) => (t ? i : acc), 0);

  // Where to plant the ✕: the step of the actor who rejected/recalled, but never
  // before the last step the chain actually completed.
  const stopAction = stopped ? actions?.find((a) => stepIndexForAction(a, chain) === STOPPED) : undefined;
  const marker = stopped
    ? Math.min(chain.length - 1, Math.max(reached, idx, stepIndexByRole(stopAction?.role, chain)))
    : idx;
  const stopLabel = status === 'rejected' ? 'Rejected' : status === 'recalled' ? 'Recalled' : 'Stopped';
  const stopRose = status === 'rejected';
  const pct = marker <= 0 ? 0 : (marker / (chain.length - 1)) * 100;

  return (
    <div className={cn('relative px-1 pt-1', className)}>
      <div className="absolute left-[19px] right-[19px] top-[15px] h-0.5 rounded bg-slate-200" />
      {marker > 0 && (
        <div
          className="absolute left-[19px] top-[15px] h-0.5 rounded bg-brand-500 transition-all duration-500"
          style={{ width: `calc((100% - 38px) * ${pct / 100})` }}
        />
      )}
      <div className="relative flex items-start justify-between">
        {chain.map((s, i) => {
          const done = i < marker;
          const current = i === marker;
          const blocked = stopped && current;
          return (
            <div key={s.status} className="flex w-16 flex-col items-center text-center">
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ring-4 ring-white transition',
                  blocked && stopRose && 'bg-rose-500 text-white shadow-sm',
                  blocked && !stopRose && 'bg-slate-400 text-white shadow-sm',
                  !blocked && (done || current) && 'bg-brand-600 text-white shadow-sm',
                  !blocked && !done && !current && 'border border-slate-200 bg-white text-slate-400',
                )}
              >
                {blocked ? <XCircle className="h-4 w-4" /> : done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </div>
              <p
                className={cn(
                  'mt-1.5 text-[11px] font-semibold leading-tight',
                  blocked
                    ? stopRose ? 'text-rose-700' : 'text-slate-600'
                    : current ? 'text-brand-700' : done ? 'text-slate-700' : 'text-slate-400',
                )}
              >
                {blocked ? stopLabel : s.label}
              </p>
              <p className="text-[10px] leading-tight text-slate-400">{s.who}</p>
              {times[i] && <p className="mt-0.5 text-[9px] leading-tight text-slate-400">{fmtDateTime(times[i])}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
