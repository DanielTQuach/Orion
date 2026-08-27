/**
 * Translucent FOV cones from selected ground telescopes, matching the HUD mock.
 * The cone is aligned with the local zenith, or toward the selected satellite.
 */
import { Cartesian3, Color, Ellipsoid, Quaternion } from 'cesium'
import { Entity } from 'resium'
import { HUD } from '@/lib/hud-colors'
import type { Telescope } from '@/hooks/useTelescopes'
import type { SatPosition } from '@/hooks/useSatPositions'

interface Props {
  telescopes: Telescope[]
  selectedTelescopeId?: string | null
  selectedSat?: SatPosition | null
}

const CONE_LENGTH = 2_600_000

function coneCenter(from: Cartesian3, axis: Cartesian3, length: number): Cartesian3 {
  const offset = Cartesian3.multiplyByScalar(axis, length / 2, new Cartesian3())
  return Cartesian3.add(from, offset, new Cartesian3())
}

function quaternionAligningZ(axis: Cartesian3): Quaternion {
  const n = Cartesian3.normalize(axis, new Cartesian3())
  const z = Cartesian3.UNIT_Z
  const cross = Cartesian3.cross(z, n, new Cartesian3())
  const mag = Cartesian3.magnitude(cross)
  if (mag < 1e-8) {
    if (Cartesian3.dot(z, n) > 0) return Quaternion.clone(Quaternion.IDENTITY)
    return Quaternion.fromAxisAngle(Cartesian3.UNIT_X, Math.PI)
  }
  Cartesian3.normalize(cross, cross)
  const angle = Math.acos(Math.min(1, Math.max(-1, Cartesian3.dot(z, n))))
  return Quaternion.fromAxisAngle(cross, angle)
}

export default function FovCones({ telescopes, selectedTelescopeId, selectedSat }: Props) {
  const selected = telescopes.filter(t => t.telescope_id === selectedTelescopeId)
  const extras = telescopes
    .filter(t => t.telescope_id !== selectedTelescopeId)
    .slice(0, 2)
  const shown = [...selected, ...extras]

  return (
    <>
      {shown.map(tel => {
        const origin = Cartesian3.fromDegrees(tel.lon, tel.lat, tel.alt_m + 400)
        let axis = Ellipsoid.WGS84.geodeticSurfaceNormal(origin)
        if (selectedSat && tel.telescope_id === selectedTelescopeId) {
          const satPos = Cartesian3.fromDegrees(
            selectedSat.lon,
            selectedSat.lat,
            selectedSat.alt_km * 1000,
          )
          const dir = Cartesian3.subtract(satPos, origin, new Cartesian3())
          if (Cartesian3.magnitude(dir) > 1) {
            axis = Cartesian3.normalize(dir, new Cartesian3())
          }
        }
        const isPrimary = tel.telescope_id === selectedTelescopeId
        const color: Color = isPrimary ? HUD.cyan : HUD.cyan
        return (
          <Entity
            key={`fov-${tel.telescope_id}`}
            position={coneCenter(origin, axis, CONE_LENGTH)}
            orientation={quaternionAligningZ(axis)}
            cylinder={{
              length: CONE_LENGTH,
              topRadius: isPrimary ? 780_000 : 420_000,
              bottomRadius: 40,
              numberOfVerticalLines: 10,
              slices: 24,
              material: color.withAlpha(isPrimary ? 0.14 : 0.06),
              outline: true,
              outlineColor: color.withAlpha(isPrimary ? 0.55 : 0.22),
            }}
          />
        )
      })}
    </>
  )
}
