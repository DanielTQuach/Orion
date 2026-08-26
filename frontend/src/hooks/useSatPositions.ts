/**
 * Polls /api/propagate for a list of NORAD IDs and returns
 * their current lat/lon/alt positions. Refreshes every `intervalMs`.
 */
import { useEffect, useState, useRef } from 'react'

export interface SatPosition {
  norad_id: number
  name: string
  lat: number
  lon: number
  alt_km: number
  timestamp: string
}

const DEFAULT_INTERVAL_MS = 10_000 // 10 seconds

export function useSatPositions(noradIds: number[], intervalMs = DEFAULT_INTERVAL_MS) {
  const [positions, setPositions] = useState<Map<number, SatPosition>>(new Map())
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchAll = async () => {
    if (noradIds.length === 0) return
    setLoading(true)
    try {
      const results = await Promise.allSettled(
        noradIds.map(id =>
          fetch('/api/propagate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ norad_id: id }),
          }).then(r => r.ok ? r.json() : Promise.reject(r.status))
        )
      )
      const next = new Map<number, SatPosition>()
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') next.set(noradIds[i], r.value)
      })
      setPositions(next)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (noradIds.length === 0) {
      setPositions(new Map())
      return
    }
    fetchAll()
    timerRef.current = setInterval(fetchAll, intervalMs)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [noradIds.join(','), intervalMs])

  return { positions, loading }
}
