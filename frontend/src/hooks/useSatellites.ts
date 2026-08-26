/**
 * Fetches satellite list from /api/satellites with optional filters.
 * Re-fetches whenever the filter params change.
 */
import { useEffect, useState, useCallback } from 'react'

export interface Satellite {
  norad_id: number
  name: string
  operator: string | null
  category: string | null
  is_reflective: boolean
  source: string | null
}

export interface SatelliteFilters {
  category?: string
  operator?: string
  is_reflective?: boolean
}

export function useSatellites(filters: SatelliteFilters = {}) {
  const [satellites, setSatellites] = useState<Satellite[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchSatellites = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (filters.category) params.set('category', filters.category)
      if (filters.operator) params.set('operator', filters.operator)
      if (filters.is_reflective !== undefined)
        params.set('is_reflective', String(filters.is_reflective))

      const res = await fetch(`/api/satellites?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setSatellites(await res.json())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [filters.category, filters.operator, filters.is_reflective])

  useEffect(() => {
    fetchSatellites()
  }, [fetchSatellites])

  return { satellites, loading, error, refetch: fetchSatellites }
}
