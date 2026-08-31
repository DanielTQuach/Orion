/**
 * TLE status banner — shown at the top when the cache is empty.
 */
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

export default function TleStatusBanner() {
  const [count, setCount] = useState<number | null>(null)
  const [seeding, setSeeding] = useState(false)

  const checkStatus = () =>
    fetch('/api/tle/status')
      .then(r => (r.ok ? r.json() : null))
      .then(d => d && setCount(d.cached_tle_count))
      .catch(() => {})

  useEffect(() => {
    checkStatus()
    const t = setInterval(checkStatus, 15_000)
    return () => clearInterval(t)
  }, [])

  const seedFallback = async () => {
    setSeeding(true)
    await fetch('/api/tle/seed', { method: 'POST' }).catch(() => {})
    await checkStatus()
    setSeeding(false)
  }

  if (count === null || count > 0) return null

  return (
    <div className="relative z-50 flex shrink-0 items-center gap-3 border-b border-critical/30 bg-critical/10 px-4 py-2 text-sm text-foreground">
      <span className="text-critical">⚠</span>
      <span className="text-[13px] text-muted-foreground">
        No satellite TLEs in cache — CelesTrak may be unreachable.
      </span>
      <button
        type="button"
        onClick={seedFallback}
        disabled={seeding}
        className={cn(
          'ml-auto shrink-0 rounded-md border border-brass/35 bg-brass/15 px-3 py-1 font-mono text-[11px] tracking-wide text-brass uppercase transition-colors',
          'hover:bg-brass/25 disabled:opacity-50',
        )}
      >
        {seeding ? 'Loading…' : 'Load demo TLEs'}
      </button>
    </div>
  )
}
