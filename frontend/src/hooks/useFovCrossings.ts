/**
 * Fetches FOV crossing events for a telescope from /api/fov/crossings.
 */
import { useEffect, useState, useCallback } from 'react'

export interface FovCrossingEvent {
  id: number
  norad_id: number
  telescope_id: string
  event_time: string
  duration_s: number | null
  separation_deg: number | null
  boresight_az_deg: number | null
  boresight_el_deg: number | null
  fov_deg: number | null
}

export function useFovCrossings(telescopeId: string | null) {
  const [events, setEvents] = useState<FovCrossingEvent[]>([])
  const [loading, setLoading] = useState(false)

  const refetch = useCallback(async () => {
    if (!telescopeId) {
      setEvents([])
      return
    }
    setLoading(true)
    try {
      const res = await fetch(
        `/api/fov/crossings?telescope_id=${encodeURIComponent(telescopeId)}`,
      )
      if (res.ok) setEvents(await res.json())
    } finally {
      setLoading(false)
    }
  }, [telescopeId])

  useEffect(() => {
    refetch()
  }, [refetch])

  const crossingIds = new Set(events.map(e => e.norad_id))

  return { events, loading, crossingIds, refetch }
}
