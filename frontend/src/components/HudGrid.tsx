/**
 * Schematic latitude / meridian rings to match the HUD visualizer look.
 */
import { Cartesian3, ArcType } from 'cesium'
import { Entity } from 'resium'
import { HUD } from '@/lib/hud-colors'

function latRing(lat: number, altM = 28_000): Cartesian3[] {
  const pts: Cartesian3[] = []
  for (let lon = -180; lon <= 180; lon += 6) {
    pts.push(Cartesian3.fromDegrees(lon, lat, altM))
  }
  return pts
}

function meridian(lon: number, altM = 28_000): Cartesian3[] {
  const pts: Cartesian3[] = []
  for (let lat = -80; lat <= 80; lat += 6) {
    pts.push(Cartesian3.fromDegrees(lon, lat, altM))
  }
  return pts
}

const LATITUDES = [-60, -30, 0, 30, 60]
const MERIDIANS = [-150, -90, -30, 30, 90, 150]

export default function HudGrid() {
  return (
    <>
      {LATITUDES.map(lat => (
        <Entity
          key={`lat-${lat}`}
          polyline={{
            positions: latRing(lat),
            width: lat === 0 ? 1.4 : 0.8,
            material: HUD.cyan.withAlpha(lat === 0 ? 0.45 : 0.18),
            arcType: ArcType.GEODESIC,
            clampToGround: false,
          }}
        />
      ))}
      {MERIDIANS.map(lon => (
        <Entity
          key={`lon-${lon}`}
          polyline={{
            positions: meridian(lon),
            width: 0.6,
            material: HUD.cyan.withAlpha(0.12),
            arcType: ArcType.GEODESIC,
            clampToGround: false,
          }}
        />
      ))}
    </>
  )
}
