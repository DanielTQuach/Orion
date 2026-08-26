/**
 * HistoricalTrail — renders a 3D fading trail at orbital altitude
 * showing where the satellite has been over the last ~10 minutes.
 *
 * Points are in ECEF (km), converted directly to Cesium Cartesian3.
 * The trail fades from transparent (oldest) to bright cyan (newest).
 * Re-fetches whenever noradId changes or on the polling interval.
 */
import { useEffect, useState, useRef } from 'react'
import { Cartesian3, Color, PolylineGlowMaterialProperty } from 'cesium'
import { Entity } from 'resium'

interface TrailPoint {
  x_km: number
  y_km: number
  z_km: number
  alt_km: number
  timestamp: string
}

interface Props {
  noradId: number | null
  /** Refresh interval in ms — should match live position poll. Default 10s */
  intervalMs?: number
}

const STEPS        = 20
const STEP_SECONDS = 30
const KM_TO_M      = 1000

export default function HistoricalTrail({ noradId, intervalMs = 10_000 }: Props) {
  const [positions, setPositions] = useState<Cartesian3[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchTrail = async (id: number) => {
    try {
      const res = await fetch(
        `/api/history/${id}?steps=${STEPS}&step_seconds=${STEP_SECONDS}`
      )
      if (!res.ok) return
      const data: { trail: TrailPoint[] } = await res.json()
      setPositions(
        data.trail.map(p =>
          // ECEF km → Cesium metres (Cesium uses metres internally)
          new Cartesian3(p.x_km * KM_TO_M, p.y_km * KM_TO_M, p.z_km * KM_TO_M)
        )
      )
    } catch {
      // silently ignore — trail is cosmetic
    }
  }

  useEffect(() => {
    if (!noradId) {
      setPositions([])
      return
    }
    fetchTrail(noradId)
    timerRef.current = setInterval(() => fetchTrail(noradId), intervalMs)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [noradId, intervalMs])

  if (positions.length < 2) return null

  return (
    <Entity
      polyline={{
        positions,
        width: 3,
        // Glow material gives the luminous streak effect seen in real photos
        material: new PolylineGlowMaterialProperty({
          glowPower: 0.2,
          color: Color.CYAN.withAlpha(0.85),
        }),
        clampToGround: false,
      }}
    />
  )
}
