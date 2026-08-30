import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function HudFrame({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('relative', className)}>
      <span className="pointer-events-none absolute top-0 left-0 h-3 w-3 border-t border-l border-brass/50" />
      <span className="pointer-events-none absolute top-0 right-0 h-3 w-3 border-t border-r border-brass/50" />
      <span className="pointer-events-none absolute bottom-0 left-0 h-3 w-3 border-b border-l border-brass/50" />
      <span className="pointer-events-none absolute right-0 bottom-0 h-3 w-3 border-r border-b border-brass/50" />
      {children}
    </div>
  )
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="font-mono text-[10px] font-medium tracking-[0.22em] text-brass/80 uppercase">
      {children}
    </p>
  )
}
