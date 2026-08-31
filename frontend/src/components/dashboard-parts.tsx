import type { ReactNode } from 'react'
import { Eyebrow, HudFrame } from '@/components/hud-frame'
import { cn } from '@/lib/utils'

export function Panel({
  title,
  meta,
  children,
  className,
  bodyClassName,
  step,
}: {
  title: string
  meta?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  step?: string
}) {
  return (
    <HudFrame className={cn('flex min-h-0 flex-col bg-panel/80 backdrop-blur-md', className)}>
      <header className="flex shrink-0 items-center justify-between border-b border-white/8 px-3 py-2.5">
        <div className="min-w-0">
          {step ? <Eyebrow>{step}</Eyebrow> : null}
          <h2
            className={cn(
              'truncate text-sm font-medium tracking-tight text-foreground',
              step && 'mt-0.5',
            )}
          >
            {title}
          </h2>
        </div>
        {meta ? (
          <div className="shrink-0 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
            {meta}
          </div>
        ) : null}
      </header>
      <div className={cn('min-h-0 flex-1 overflow-auto p-3', bodyClassName)}>{children}</div>
    </HudFrame>
  )
}

export function Stat({
  label,
  value,
  unit,
  tone = 'cyan',
  sub,
}: {
  label: string
  value: string
  unit?: string
  tone?: 'cyan' | 'amber' | 'red' | 'plain'
  sub?: string
}) {
  const toneClass =
    tone === 'amber'
      ? 'text-brass'
      : tone === 'red'
        ? 'text-critical'
        : tone === 'plain'
          ? 'text-foreground'
          : 'text-cyan'
  return (
    <div className="rounded-lg border border-white/8 bg-panel/60 px-3 py-2.5">
      <div className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
        {label}
      </div>
      <div className={cn('mt-1 font-mono text-2xl leading-none tabular-nums', toneClass)}>
        {value}
        {unit ? <span className="ml-1 text-[11px] text-muted-foreground">{unit}</span> : null}
      </div>
      {sub ? <div className="mt-1 font-mono text-[10px] text-muted-foreground">{sub}</div> : null}
    </div>
  )
}

export function Bar({ value, max, tone }: { value: number; max: number; tone: 'cyan' | 'amber' | 'red' }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  const bg = tone === 'amber' ? 'bg-brass' : tone === 'red' ? 'bg-critical' : 'bg-cyan'
  return (
    <div className="h-1.5 w-full bg-white/8">
      <div className={cn('h-full', bg)} style={{ width: `${pct}%` }} />
    </div>
  )
}
