import { Badge } from './ui/primitives';
import { STATUS_LABELS, STATUS_COLORS, TYPE_LABELS, type TicketStatus, type TicketType } from '@/lib/types';
import { cn } from '@/lib/utils';

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <Badge className={cn('capitalize', STATUS_COLORS[status] || 'bg-slate-100 text-slate-600')}>
      {STATUS_LABELS[status] || status}
    </Badge>
  );
}

export function TypeBadge({ type }: { type: TicketType }) {
  const tones: Record<TicketType, string> = {
    request: 'bg-sky-50 text-sky-700 ring-sky-600/20',
    borrow: 'bg-violet-50 text-violet-700 ring-violet-600/20',
    cs_transfer: 'bg-cyan-50 text-cyan-700 ring-cyan-600/20',
  };
  return (
    <Badge className={tones[type]}>
      {TYPE_LABELS[type] || type}
    </Badge>
  );
}

export function LowBadge() {
  return <Badge className="bg-amber-50 text-amber-700 ring-amber-600/20">Low</Badge>;
}

export function OutBadge() {
  return <Badge className="bg-rose-50 text-rose-700 ring-rose-600/20">Out of Stock</Badge>;
}

export function CsOnlyBadge() {
  return <Badge className="bg-cyan-50 text-cyan-700 ring-cyan-600/20">CS only</Badge>;
}

export function MktOnlyBadge() {
  return <Badge className="bg-indigo-50 text-indigo-700 ring-indigo-600/20">MKT only</Badge>;
}