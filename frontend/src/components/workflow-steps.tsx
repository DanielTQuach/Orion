import { cn } from '@/lib/utils'

const STEPS = [
  { id: 1, label: 'Select' },
  { id: 2, label: 'Watch' },
  { id: 3, label: 'Predict' },
  { id: 4, label: 'Schedule' },
] as const

export type WorkflowPhase = 1 | 2 | 3 | 4

export function WorkflowSteps({
  current,
  compact = false,
  onSelect,
}: {
  current: WorkflowPhase
  compact?: boolean
  onSelect?: (id: WorkflowPhase) => void
}) {
  return (
    <ol className="flex items-center">
      {STEPS.map((step, i) => {
        const done = current > step.id
        const active = current === step.id
        const isPredict  = step.id === 3
        const isSchedule = step.id === 4
        const clickable = Boolean(onSelect)
        return (
          <li key={step.id} className="flex items-center">
            <button
              type="button"
              disabled={!clickable}
              onClick={() => onSelect?.(step.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-2 py-1 font-mono text-[10px] tracking-[0.14em] uppercase transition-colors',
                clickable && 'cursor-pointer',
                !clickable && 'cursor-default',
                active && isSchedule && 'bg-violet/15 text-violet ring-1 ring-violet/45',
                active && isPredict && 'bg-cyan/15 text-cyan ring-1 ring-cyan/45',
                active && !isPredict && !isSchedule && 'bg-brass/12 text-brass ring-1 ring-brass/35',
                !active && isSchedule && 'text-violet/80 ring-1 ring-violet/25',
                done && !isSchedule && 'text-signal',
                !active && !done && !isSchedule && 'text-muted-foreground/45',
              )}
            >
              <span
                className={cn(
                  'flex size-4 items-center justify-center rounded-full text-[9px]',
                  active && isSchedule && 'bg-violet text-void',
                  active && isPredict && 'bg-cyan text-void',
                  active && !isPredict && !isSchedule && 'bg-brass text-void',
                  done && 'bg-signal/20',
                  !active && isSchedule && 'bg-violet/25 text-violet',
                  !active && !done && !isSchedule && 'bg-white/8',
                )}
              >
                {step.id}
              </span>
              {!compact && step.label}
            </button>
            {i < STEPS.length - 1 && (
              <span
                className={cn(
                  'mx-1 h-px w-3 sm:w-5',
                  done ? 'bg-signal/50' : 'bg-white/12',
                )}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}
