/**
 * Renders satellite positions as HUD-style markers (cyan / amber / selected).
 */
import { Cartesian3, Color, VerticalOrigin, LabelStyle, NearFarScalar } from 'cesium'
import { Entity } from 'resium'
import type { SatPosition } from '@/hooks/useSatPositions'
import { HUD } from '@/lib/hud-colors'

interface Props {
  positions: Map<number, SatPosition>
  selectedId?: number | null
  reflectingIds?: Set<number>
  onSelect?: (noradId: number) => void
}

export default function SatelliteLayer({ positions, selectedId, reflectingIds = new Set(), onSelect }: Props) {
  return (
    <>
      {Array.from(positions.values()).map(sat => {
        const isSelected = sat.norad_id === selectedId
        const reflecting = reflectingIds.has(sat.norad_id)
        const color: Color = isSelected ? HUD.cyan : reflecting ? HUD.amber : HUD.cyan
        return (
          <Entity
            key={sat.norad_id}
            name={sat.name}
            position={Cartesian3.fromDegrees(sat.lon, sat.lat, sat.alt_km * 1000)}
            point={{
              pixelSize: isSelected ? 14 : 8,
              color: color.withAlpha(isSelected ? 1 : 0.9),
              outlineColor: Color.BLACK.withAlpha(0.6),
              outlineWidth: 1,
              scaleByDistance: new NearFarScalar(1.0e6, 1.4, 2.4e7, 0.7),
            }}
            label={{
              text: sat.name,
              font: '11px "JetBrains Mono", monospace',
              fillColor: HUD.cyan,
              outlineColor: Color.BLACK,
              outlineWidth: 3,
              style: LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: VerticalOrigin.BOTTOM,
              pixelOffset: { x: 0, y: -14 } as any,
              show: isSelected,
            }}
            onClick={() => onSelect?.(sat.norad_id)}
          />
        )
      })}
    </>
  )
}
