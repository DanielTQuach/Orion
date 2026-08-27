/**
 * Ground telescopes as HUD pins; selected site gets a TS-style callout.
 */
import { Cartesian3, Color, VerticalOrigin, LabelStyle, NearFarScalar } from 'cesium'
import { Entity } from 'resium'
import type { Telescope } from '@/hooks/useTelescopes'
import { HUD } from '@/lib/hud-colors'

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
              pixelSize: isSelected ? 16 : 9,
              color: isSelected ? HUD.cyan : HUD.amber.withAlpha(0.9),
              outlineColor: Color.BLACK.withAlpha(0.65),
              outlineWidth: 1,
              scaleByDistance: new NearFarScalar(1.0e6, 1.3, 2.4e7, 0.75),
            }}
            label={{
              text: `${tel.telescope_id}  ${tel.name}`,
              font: '12px "JetBrains Mono", monospace',
              fillColor: HUD.cyan,
              outlineColor: Color.BLACK,
              outlineWidth: 4,
              style: LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: VerticalOrigin.BOTTOM,
              pixelOffset: { x: 0, y: -16 } as any,
              show: isSelected,
            }}
            onClick={() => onSelect?.(tel.telescope_id)}
          />
        )
      })}
    </>
  )
}
