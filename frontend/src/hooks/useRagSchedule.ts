/**
 * Hook for the RAG scheduling pipeline — POST /api/rag/schedule
 *
 * Sends a pointing request through the 5-stage pipeline and returns the
 * approved maneuver (or rejection) from the backend.
 */
import { useState, useCallback } from 'react'

export interface RagRequest {
  ra_deg: number
  dec_deg: number
  science_goal: string
  priority: number
  mission: string
  sun_limit_deg?: number
  moon_limit_deg?: number
  telescope_id?: string
}

export interface KeeputGeometry {
  sun:  { ra_deg: number; dec_deg: number }
  moon: { ra_deg: number; dec_deg: number }
  computed_at?: string
}

export interface ValidationChecks {
  coordinate_sanity?:  { passed: boolean; issues: string[] }
  keepout?:            { safe: boolean; sun_sep_deg: number; moon_sep_deg: number; violations: string[] }
  earth_limb?:         { passed: boolean; issues: string[] }
  contamination?:      { passed: boolean; issues: string[] }
  granite_confidence?: { passed: boolean; value: number; threshold: number }
}

export interface RagResult {
  approved:            boolean
  stage_reached:       string
  chosen_ra_deg:       number | null
  chosen_dec_deg:      number | null
  justification:       string | null
  contamination_risk:  string | null
  granite_confidence:  number | null
  violations:          string[]
  keepout_geometry:    KeeputGeometry
  candidate_stats:     { total_before_filter?: number; safe_after_filter?: number }
  validation_checks:   ValidationChecks
}

export function useRagSchedule() {
  const [result, setResult]   = useState<RagResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const schedule = useCallback(async (req: RagRequest) => {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/rag/schedule', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(req),
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}))
        throw new Error(detail?.detail ?? `HTTP ${res.status}`)
      }
      setResult(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setResult(null)
    setError(null)
  }, [])

  return { schedule, result, loading, error, reset }
}
