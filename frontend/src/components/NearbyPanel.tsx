/**
 * Nearby satellites for the selected telescope, sorted by 3D distance.
 */
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface NearbySat {
  norad_id: number
  name: string
  category: string | null
  operator: string | null
  lat: number
  lon: number
  alt_km: number
  distance_km: number
}

interface Props {
  telescopeId: string | null
  selectedSatId: number | null
  onSelectSat: (id: number) => void
}

export default function NearbyPanel({ telescopeId, selectedSatId, onSelectSat }: Props) {
  const [satellites, setSatellites] = useState<NearbySat[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!telescopeId) {
      setSatellites([])
      return
    }
    setLoading(true)
    fetch(`/api/telescopes/${encodeURIComponent(telescopeId)}/nearby?limit=8`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => d && setSatellites(d.satellites))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [telescopeId])

  if (!telescopeId) {
    return <p className="font-mono text-[11px] text-muted-foreground">Select a telescope to see nearby satellites.</p>
  }

  if (loading) {
    return <p className="font-mono text-[11px] text-muted-foreground">Finding nearby satellites…</p>
  }

  if (satellites.length === 0) {
    return (
      <p className="font-mono text-[11px] text-muted-foreground">
        No satellites with cached TLEs near this site.
      </p>
    )
  }

  return (
    <ul className="space-y-1">
      {satellites.map((sat, i) => {
        const selected = sat.norad_id === selectedSatId
        return (
          <li key={sat.norad_id}>
            <button
              type="button"
              onClick={() => onSelectSat(sat.norad_id)}
              className={cn(
                'flex w-full items-start gap-2 rounded-sm border px-2 py-1.5 text-left transition-colors',
                selected
                  ? 'border-primary/60 bg-primary/10'
                  : 'border-transparent hover:border-border/60 hover:bg-muted/40',
              )}
            >
              <span className="mt-0.5 w-5 shrink-0 font-mono text-[10px] text-muted-foreground">#{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-foreground">{sat.name}</span>
                <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">
                  {sat.distance_km.toLocaleString()} km away · {sat.alt_km.toFixed(0)} km alt
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
