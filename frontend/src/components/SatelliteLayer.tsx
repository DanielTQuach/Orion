/**
 * Renders satellite positions as Cesium BillboardGraphics (point + label).
 * Receives a Map of live positions and renders one entity per satellite.
 */
import { Cartesian3, Color, VerticalOrigin } from 'cesium'
import { Entity } from 'resium'
import type { SatPosition } from '@/hooks/useSatPositions'

interface Props {
  positions: Map<number, SatPosition>
  selectedId?: number | null
  onSelect?: (noradId: number) => void
}

export default function SatelliteLayer({ positions, selectedId, onSelect }: Props) {
  return (
    <>
      {Array.from(positions.values()).map(sat => {
        const isSelected = sat.norad_id === selectedId
        return (
          <Entity
            key={sat.norad_id}
            name={sat.name}
            position={Cartesian3.fromDegrees(sat.lon, sat.lat, sat.alt_km * 1000)}
            point={{
              pixelSize: isSelected ? 10 : 6,
              color: isSelected ? Color.YELLOW : Color.CYAN,
              outlineColor: Color.BLACK,
              outlineWidth: 1,
            }}
            label={{
              text: sat.name,
              font: '11px system-ui',
              fillColor: Color.WHITE,
              outlineColor: Color.BLACK,
              outlineWidth: 2,
              verticalOrigin: VerticalOrigin.BOTTOM,
              pixelOffset: { x: 0, y: -10 } as any,
              show: isSelected,
            }}
            onClick={() => onSelect?.(sat.norad_id)}
          />
        )
      })}
    </>
  )
}
