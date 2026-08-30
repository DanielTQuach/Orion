import { cn } from '@/lib/utils'

const STEPS = [
  { id: 1, label: 'Select' },
  { id: 2, label: 'Watch' },
  { id: 3, label: 'Predict' },
] as const

export type WorkflowPhase = 1 | 2 | 3

export function WorkflowSteps({
  current,
  compact = false,
}: {
  current: WorkflowPhase
  compact?: boolean
}) {
  return (
    <ol className="flex items-center">
      {STEPS.map((step, i) => {
        const done = current > step.id
        const active = current === step.id
        const isPredict = step.id === 3
        return (
          <li key={step.id} className="flex items-center">
            <div
              className={cn(
                'flex items-center gap-1.5 rounded-full px-2 py-1 font-mono text-[10px] tracking-[0.14em] uppercase transition-colors',
                active && isPredict && 'bg-cyan/15 text-cyan ring-1 ring-cyan/45',
                active && !isPredict && 'bg-brass/12 text-brass ring-1 ring-brass/35',
                done && 'text-signal',
                !active && !done && 'text-muted-foreground/45',
              )}
            >
              <span
                className={cn(
                  'flex size-4 items-center justify-center rounded-full text-[9px]',
                  active && isPredict && 'bg-cyan text-void',
                  active && !isPredict && 'bg-brass text-void',
                  done && 'bg-signal/20',
                  !active && !done && 'bg-white/8',
                )}
              >
                {step.id}
              </span>
              {!compact && step.label}
            </div>
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
