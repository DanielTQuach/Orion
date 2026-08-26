/**
 * Fetches reflection events for a telescope from /api/reflections
 * and returns them grouped by NORAD ID for easy lookup.
 */
import { useEffect, useState, useCallback } from 'react'

export interface ReflectionEvent {
  id: number
  norad_id: number
  telescope_id: string
  event_time: string
  duration_s: number | null
  angle_deg: number | null
}

export function useReflections(telescopeId: string | null) {
  const [events, setEvents] = useState<ReflectionEvent[]>([])
  const [loading, setLoading] = useState(false)

  const fetch_ = useCallback(async () => {
    if (!telescopeId) { setEvents([]); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/reflections?telescope_id=${encodeURIComponent(telescopeId)}`)
      if (res.ok) setEvents(await res.json())
    } finally {
      setLoading(false)
    }
  }, [telescopeId])

  useEffect(() => { fetch_() }, [fetch_])

  // Set of NORAD IDs currently reflecting
  const reflectingIds = new Set(events.map(e => e.norad_id))

  return { events, loading, reflectingIds, refetch: fetch_ }
}
