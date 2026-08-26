/**
 * Highlights satellites that have active reflection events for the
 * selected telescope — renders a red halo ring around each one.
 */
import { Cartesian3, Color } from 'cesium'
import { Entity } from 'resium'
import type { SatPosition } from '@/hooks/useSatPositions'

interface Props {
  positions: Map<number, SatPosition>
  reflectingIds: Set<number>
}

export default function ReflectionOverlay({ positions, reflectingIds }: Props) {
  if (reflectingIds.size === 0) return null

  return (
    <>
      {Array.from(reflectingIds).map(noradId => {
        const pos = positions.get(noradId)
        if (!pos) return null
        return (
          <Entity
            key={`refl-${noradId}`}
            position={Cartesian3.fromDegrees(pos.lon, pos.lat, pos.alt_km * 1000)}
            ellipse={{
              semiMajorAxis: 120_000,    // 120 km radius halo
              semiMinorAxis: 120_000,
              material: Color.RED.withAlpha(0.25),
              outline: true,
              outlineColor: Color.RED,
              outlineWidth: 2,
              height: pos.alt_km * 1000,
            }}
          />
        )
      })}
    </>
  )
}
