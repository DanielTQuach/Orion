/**
 * Dim orbital rings for every tracked satellite; brighter ring for the selection.
 */
import { useEffect, useState } from 'react'
import { Cartesian3, Color, ArcType } from 'cesium'
import { Entity } from 'resium'
import { HUD } from '@/lib/hud-colors'
import type { SatPosition } from '@/hooks/useSatPositions'

interface TrackPoint {
  lat: number
  lon: number
  alt_km: number
}

interface Props {
  positions: Map<number, SatPosition>
  selectedId?: number | null
  reflectingIds?: Set<number>
}

export default function OrbitRings({ positions, selectedId, reflectingIds = new Set() }: Props) {
  const [tracks, setTracks] = useState<Map<number, Cartesian3[]>>(new Map())
  const ids = Array.from(positions.keys()).join(',')

  useEffect(() => {
    const noradIds = ids ? ids.split(',').map(Number) : []
    if (noradIds.length === 0) {
      setTracks(new Map())
      return
    }

    let cancelled = false
    Promise.all(
      noradIds.map(id =>
        fetch(`/api/groundtrack/${id}?steps=72&step_seconds=80`)
          .then(r => (r.ok ? r.json() : null))
          .then((data: { track: TrackPoint[] } | null) => {
            if (!data?.track) return [id, [] as Cartesian3[]] as const
            const pts = data.track.map(p =>
              Cartesian3.fromDegrees(p.lon, p.lat, p.alt_km * 1000),
            )
            return [id, pts] as const
          })
          .catch(() => [id, [] as Cartesian3[]] as const),
      ),
    ).then(entries => {
      if (cancelled) return
      setTracks(new Map(entries.filter(([, pts]) => pts.length >= 2)))
    })

    return () => {
      cancelled = true
    }
  }, [ids])

  return (
    <>
      {Array.from(tracks.entries()).map(([id, pts]) => {
        const selected = id === selectedId
        const reflecting = reflectingIds.has(id)
        const color: Color = reflecting ? HUD.amber : HUD.cyan
        return (
          <Entity
            key={`orbit-${id}`}
            polyline={{
              positions: pts,
              width: selected ? 2.2 : 1.1,
              material: color.withAlpha(selected ? 0.75 : 0.28),
              arcType: ArcType.NONE,
              clampToGround: false,
            }}
          />
        )
      })}
    </>
  )
}
