import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

type SemanticTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONE_MAP: Record<string, SemanticTone> = {
  // positive / healthy
  running: 'success',
  completed: 'success',
  approved: 'success',
  active: 'success',
  connected: 'success',
  reachable: 'success',
  healthy: 'success',
  online: 'success',
  enabled: 'success',
  ok: 'success',
  idle: 'success',
  // transitional / attention
  pending: 'warning',
  queued: 'warning',
  waiting: 'warning',
  activating: 'warning',
  'not-found': 'warning',
  not_found: 'warning',
  degraded: 'warning',
  starting: 'warning',
  // negative / critical
  failed: 'danger',
  error: 'danger',
  down: 'danger',
  rejected: 'danger',
  disconnected: 'danger',
  unreachable: 'danger',
  critical: 'danger',
  // informational
  allocated: 'info',
  mixed: 'info',
  setup: 'info',
  // neutral
  cancelled: 'neutral',
  canceled: 'neutral',
  inactive: 'neutral',
  unknown: 'neutral',
  disabled: 'neutral',
  archived: 'neutral',
  fallback: 'neutral',
};

const TONE_CLASSES: Record<SemanticTone, string> = {
  success: 'bg-success/10 text-success border-success/20',
  warning: 'bg-warning/10 text-warning border-warning/25',
  danger: 'bg-destructive/10 text-destructive border-destructive/20',
  info: 'bg-info/10 text-info border-info/20',
  neutral: 'bg-muted text-muted-foreground border-border',
};

const DOT_CLASSES: Record<SemanticTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
  info: 'bg-info',
  neutral: 'bg-muted-foreground/60',
};

interface StatusBadgeProps {
  status?: string;
  /** Optional display override; defaults to the raw status value. */
  label?: string;
  className?: string;
  withDot?: boolean;
}

export function StatusBadge({ status, label, className, withDot = true }: StatusBadgeProps) {
  if (!status) return null;
  const key = status.trim().toLowerCase().replace(/\s+/g, '-');
  const tone = TONE_MAP[key] ?? 'neutral';

  return (
    <Badge variant="outline" className={cn('gap-1.5 font-medium', TONE_CLASSES[tone], className)}>
      {withDot && (
        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', DOT_CLASSES[tone])} aria-hidden />
      )}
      <span className="truncate">{label ?? status}</span>
    </Badge>
  );
}
