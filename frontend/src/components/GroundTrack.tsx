/**
 * Renders a satellite ground track as a Cesium polyline.
 * Fetches from GET /api/groundtrack/{norad_id} when noradId changes.
 */
import { useEffect, useState } from 'react'
import { Cartesian3, Color, ArcType } from 'cesium'
import { Entity } from 'resium'

interface TrackPoint {
  lat: number
  lon: number
  alt_km: number
}

interface Props {
  noradId: number | null
}

export default function GroundTrack({ noradId }: Props) {
  const [positions, setPositions] = useState<Cartesian3[]>([])

  useEffect(() => {
    if (!noradId) {
      setPositions([])
      return
    }

    fetch(`/api/groundtrack/${noradId}?steps=90&step_seconds=60`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: { track: TrackPoint[] }) => {
        setPositions(
          data.track.map(p =>
            Cartesian3.fromDegrees(p.lon, p.lat, p.alt_km * 1000)
          )
        )
      })
      .catch(() => setPositions([]))
  }, [noradId])

  if (positions.length < 2) return null

  return (
    <Entity
      polyline={{
        positions,
        width: 1.5,
        material: Color.CYAN.withAlpha(0.5),
        arcType: ArcType.NONE,
        clampToGround: false,
      }}
    />
  )
}
