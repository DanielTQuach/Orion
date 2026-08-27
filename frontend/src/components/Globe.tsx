/**
 * Globe — CesiumJS Viewer styled as a schematic HUD orbital visualizer.
 */
import {
  Ion,
  Cartesian3,
  Math as CesiumMath,
  Color,
  GridImageryProvider,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { Viewer } from 'resium'
import { useRef, useEffect } from 'react'
import type { CesiumComponentRef } from 'resium'
import type { Viewer as CesiumViewer } from 'cesium'
import SatelliteLayer from './SatelliteLayer'
import TelescopeLayer from './TelescopeLayer'
import OrbitRings from './OrbitRings'
import HudGrid from './HudGrid'
import FovCones from './FovCones'
import HistoricalTrail from './HistoricalTrail'
import ReflectionOverlay from './ReflectionOverlay'
import ReflectionRay from './ReflectionRay'
import type { SatPosition } from '@/hooks/useSatPositions'
import type { Telescope } from '@/hooks/useTelescopes'
import { HUD } from '@/lib/hud-colors'

Ion.defaultAccessToken = ''

interface SunDirection { x: number; y: number; z: number }

interface Props {
  satPositions: Map<number, SatPosition>
  telescopes: Telescope[]
  selectedSatId?: number | null
  selectedTelescopeId?: string | null
  onSelectSat?: (id: number) => void
  onSelectTelescope?: (id: string) => void
  flyToTelescope?: Telescope | null
  reflectingIds?: Set<number>
  sunDirection?: SunDirection | null
}

function applyHudScene(viewer: CesiumViewer) {
  viewer.imageryLayers.removeAll()
  viewer.imageryLayers.addImageryProvider(
    new GridImageryProvider({
      cells: 8,
      color: Color.fromCssColorString('#7fe3ee').withAlpha(0.08),
      glowColor: Color.fromCssColorString('#7fe3ee').withAlpha(0.04),
      glowWidth: 1,
      backgroundColor: Color.fromCssColorString('#061018'),
    }),
  )

  viewer.scene.globe.baseColor = HUD.navy
  viewer.scene.globe.enableLighting = false
  viewer.scene.globe.showGroundAtmosphere = true
  viewer.scene.globe.atmosphereHueShift = 0.42
  viewer.scene.globe.atmosphereSaturationShift = -0.15
  viewer.scene.globe.atmosphereBrightnessShift = -0.45
  viewer.scene.backgroundColor = HUD.space
  viewer.scene.fog.enabled = false
  if (viewer.scene.moon) viewer.scene.moon.show = false
  if (viewer.scene.sun) viewer.scene.sun.show = false
  if (viewer.scene.skyAtmosphere) {
    viewer.scene.skyAtmosphere.hueShift = 0.5
    viewer.scene.skyAtmosphere.saturationShift = -0.25
    viewer.scene.skyAtmosphere.brightnessShift = -0.35
  }
  if (viewer.cesiumWidget.creditContainer) {
    ;(viewer.cesiumWidget.creditContainer as HTMLElement).style.display = 'none'
  }

  viewer.camera.setView({
    destination: Cartesian3.fromDegrees(12, 8, 24_000_000),
    orientation: {
      heading: 0,
      pitch: CesiumMath.toRadians(-90),
      roll: 0,
    },
  })
}

export default function Globe({
  satPositions,
  telescopes,
  selectedSatId,
  selectedTelescopeId,
  onSelectSat,
  onSelectTelescope,
  flyToTelescope,
  reflectingIds = new Set(),
  sunDirection = null,
}: Props) {
  const viewerRef = useRef<CesiumComponentRef<CesiumViewer>>(null)
  const selectedSat = selectedSatId ? satPositions.get(selectedSatId) ?? null : null

  useEffect(() => {
    let rafId: number
    const apply = () => {
      const viewer = viewerRef.current?.cesiumElement
      if (!viewer) {
        rafId = requestAnimationFrame(apply)
        return
      }
      applyHudScene(viewer)
    }
    rafId = requestAnimationFrame(apply)
    return () => cancelAnimationFrame(rafId)
  }, [])

  // Keep an overview of the globe, rotated toward the selected telescope hemisphere.
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement
    if (!viewer || !flyToTelescope) return
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(flyToTelescope.lon, flyToTelescope.lat, 22_000_000),
      orientation: {
        heading: 0,
        pitch: CesiumMath.toRadians(-88),
        roll: 0,
      },
      duration: 1.4,
    })
  }, [flyToTelescope])

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#05080f]">
      <Viewer
        ref={viewerRef}
        full
        baseLayerPicker={false}
        geocoder={false}
        homeButton={false}
        sceneModePicker={false}
        navigationHelpButton={false}
        timeline={false}
        animation={false}
        fullscreenButton={false}
        infoBox={false}
        selectionIndicator={false}
      >
        <HudGrid />
        <OrbitRings
          positions={satPositions}
          selectedId={selectedSatId}
          reflectingIds={reflectingIds}
        />
        <FovCones
          telescopes={telescopes}
          selectedTelescopeId={selectedTelescopeId}
          selectedSat={selectedSat}
        />
        <SatelliteLayer
          positions={satPositions}
          selectedId={selectedSatId}
          reflectingIds={reflectingIds}
          onSelect={onSelectSat}
        />
        <TelescopeLayer
          telescopes={telescopes}
          selectedId={selectedTelescopeId}
          onSelect={onSelectTelescope}
        />
        <HistoricalTrail noradId={selectedSatId ?? null} />
        <ReflectionOverlay positions={satPositions} reflectingIds={reflectingIds} />
        <ReflectionRay
          satPositions={satPositions}
          reflectingIds={reflectingIds}
          telescope={telescopes.find(t => t.telescope_id === selectedTelescopeId) ?? null}
          sunDirection={sunDirection}
        />
      </Viewer>
    </div>
  )
}
