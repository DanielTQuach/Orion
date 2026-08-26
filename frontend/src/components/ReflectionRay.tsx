/**
 * ReflectionRay — renders the Sun→Satellite and Satellite→Telescope
 * polylines for all active reflection events on the selected telescope.
 *
 * Sun direction is approximated as a unit vector scaled to 3× Earth radius
 * so it's visible on the globe without drawing to actual solar distance.
 * The real Sun is 150M km away — drawing that line would be invisible at globe scale.
 */
import { Cartesian3, Color } from 'cesium'
import { Entity } from 'resium'
import type { SatPosition } from '@/hooks/useSatPositions'
import type { Telescope } from '@/hooks/useTelescopes'

interface Props {
  /** Satellite positions map (norad_id → position) */
  satPositions: Map<number, SatPosition>
  /** NORAD IDs that are currently reflecting towards selectedTelescope */
  reflectingIds: Set<number>
  /** The telescope being observed */
  telescope: Telescope | null
  /** Sun direction as a unit vector in ECEF (returned by /api/reflections/check) */
  sunDirection: { x: number; y: number; z: number } | null
}

// Scale factor: draw the "sun line" to 5× Earth radius so it's visible
const SUN_LINE_SCALE_M = 6_371_000 * 5

export default function ReflectionRay({
  satPositions,
  reflectingIds,
  telescope,
  sunDirection,
}: Props) {
  if (reflectingIds.size === 0 || !telescope) return null

  const telPos = Cartesian3.fromDegrees(telescope.lon, telescope.lat, telescope.alt_m)

  return (
    <>
      {Array.from(reflectingIds).map(noradId => {
        const sat = satPositions.get(noradId)
        if (!sat) return null

        const satPos = Cartesian3.fromDegrees(sat.lon, sat.lat, sat.alt_km * 1000)

        // Satellite → Telescope ray (red — the reflection beam hitting the ground)
        const satToTel = (
          <Entity
            key={`ray-down-${noradId}`}
            polyline={{
              positions: [satPos, telPos],
              width: 2,
              material: Color.RED.withAlpha(0.8),
              clampToGround: false,
            }}
          />
        )

        // Sun → Satellite ray (yellow — incoming sunlight direction)
        // We approximate by extending from sat in the opposite direction of the sun vector
        const sunRay = sunDirection
          ? (() => {
              // Normalise sun direction and scale
              const mag = Math.sqrt(
                sunDirection.x ** 2 + sunDirection.y ** 2 + sunDirection.z ** 2
              )
              const nx = (sunDirection.x / mag) * SUN_LINE_SCALE_M
              const ny = (sunDirection.y / mag) * SUN_LINE_SCALE_M
              const nz = (sunDirection.z / mag) * SUN_LINE_SCALE_M
              // Sun-side origin: satellite position + scaled sun direction
              const sunOrigin = new Cartesian3(
                satPos.x + nx,
                satPos.y + ny,
                satPos.z + nz
              )
              return (
                <Entity
                  key={`ray-up-${noradId}`}
                  polyline={{
                    positions: [sunOrigin, satPos],
                    width: 2,
                    material: Color.YELLOW.withAlpha(0.7),
                    clampToGround: false,
                  }}
                />
              )
            })()
          : null

        return (
          <>
            {satToTel}
            {sunRay}
          </>
        )
      })}
    </>
  )
}
