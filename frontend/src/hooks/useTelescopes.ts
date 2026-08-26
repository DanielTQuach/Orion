/**
 * Fetches telescope list from /api/telescopes with optional search query.
 */
import { useEffect, useState, useCallback } from 'react'

export interface Telescope {
  telescope_id: string
  name: string
  lat: number
  lon: number
  alt_m: number
  operator: string | null
}

export function useTelescopes(search: string = '') {
  const [telescopes, setTelescopes] = useState<Telescope[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchTelescopes = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('search', search.trim())
      const res = await fetch(`/api/telescopes?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setTelescopes(await res.json())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    fetchTelescopes()
  }, [fetchTelescopes])

  return { telescopes, loading, error, refetch: fetchTelescopes }
}
