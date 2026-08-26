/**
 * Renders telescope positions as fixed Cesium pins on the globe.
 * Clicking a pin selects it and triggers onSelect.
 */
import { Cartesian3, Color, VerticalOrigin } from 'cesium'
import { Entity } from 'resium'
import type { Telescope } from '@/hooks/useTelescopes'

interface Props {
  telescopes: Telescope[]
  selectedId?: string | null
  onSelect?: (telescopeId: string) => void
}

export default function TelescopeLayer({ telescopes, selectedId, onSelect }: Props) {
  return (
    <>
      {telescopes.map(tel => {
        const isSelected = tel.telescope_id === selectedId
        return (
          <Entity
            key={tel.telescope_id}
            name={`${tel.telescope_id} — ${tel.name}`}
            position={Cartesian3.fromDegrees(tel.lon, tel.lat, tel.alt_m)}
            point={{
              pixelSize: isSelected ? 12 : 8,
              color: isSelected ? Color.ORANGE : Color.LIME,
              outlineColor: Color.BLACK,
              outlineWidth: 1,
            }}
            label={{
              text: `${tel.telescope_id}\n${tel.name}`,
              font: '12px system-ui',
              fillColor: Color.WHITE,
              outlineColor: Color.BLACK,
              outlineWidth: 2,
              verticalOrigin: VerticalOrigin.BOTTOM,
              pixelOffset: { x: 0, y: -14 } as any,
              show: isSelected,
            }}
            onClick={() => onSelect?.(tel.telescope_id)}
          />
        )
      })}
    </>
  )
}
