import type { ElementType } from 'react';
import { cn } from '@/lib/utils';

type MetricTone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const toneStyles: Record<MetricTone, string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-destructive/10 text-destructive',
  info: 'bg-info/10 text-info',
  neutral: 'bg-muted text-muted-foreground',
};

interface MetricCardProps {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: ElementType;
  tone?: MetricTone;
  progress?: number;
  onClick?: () => void;
  className?: string;
}

export function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'primary',
  progress,
  onClick,
  className,
}: MetricCardProps) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex flex-col gap-2 rounded-lg border border-border bg-card p-3.5 text-left shadow-xs transition-colors',
        onClick && 'cursor-pointer hover:border-ring/40 hover:bg-accent/40',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {Icon && (
            <span className={cn('flex h-5 w-5 items-center justify-center rounded', toneStyles[tone])}>
              <Icon className="h-3 w-3" aria-hidden />
            </span>
          )}
          {label}
        </span>
        <span className="truncate text-base font-semibold tabular-nums text-foreground">
          {value}
          {sub && <span className="ml-1 text-[11px] font-normal text-muted-foreground">{sub}</span>}
        </span>
      </div>
      {typeof progress === 'number' && (
        <div
          role="progressbar"
          aria-label={`${label} usage`}
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1 overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn(
              'h-full rounded-full transition-all',
              tone === 'primary' && 'bg-primary',
              tone === 'success' && 'bg-success',
              tone === 'warning' && 'bg-warning',
              tone === 'danger' && 'bg-destructive',
              tone === 'info' && 'bg-info',
              tone === 'neutral' && 'bg-muted-foreground'
            )}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
    </Tag>
  );
}
