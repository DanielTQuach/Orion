/**
 * Globe — CesiumJS Viewer hosting satellite and telescope layers.
 * Receives positions and telescopes as props so App.tsx owns all state.
 */
import { Ion, OpenStreetMapImageryProvider, Cartesian3, Math as CesiumMath } from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { Viewer } from 'resium'
import { useRef, useEffect } from 'react'
import type { CesiumComponentRef } from 'resium'
import type { Viewer as CesiumViewer } from 'cesium'
import SatelliteLayer from './SatelliteLayer'
import TelescopeLayer from './TelescopeLayer'
import GroundTrack from './GroundTrack'
import ReflectionOverlay from './ReflectionOverlay'
import HistoricalTrail from './HistoricalTrail'
import ReflectionRay from './ReflectionRay'
import type { SatPosition } from '@/hooks/useSatPositions'
import type { Telescope } from '@/hooks/useTelescopes'

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

  // Poll until the Cesium viewer element is available, then apply OSM imagery.
  // A plain useEffect fires before Resium finishes initialising the viewer,
  // causing an intermittent blank globe. The rAF retry loop is the safe fix.
  useEffect(() => {
    let rafId: number
    const apply = () => {
      const viewer = viewerRef.current?.cesiumElement
      if (!viewer) {
        rafId = requestAnimationFrame(apply)
        return
      }
      viewer.imageryLayers.removeAll()
      viewer.imageryLayers.addImageryProvider(
        new OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' })
      )
    }
    rafId = requestAnimationFrame(apply)
    return () => cancelAnimationFrame(rafId)
  }, [])

  // Fly to telescope — low-angle horizon view like a real observer
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement
    if (!viewer || !flyToTelescope) return
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(
        flyToTelescope.lon,
        flyToTelescope.lat,
        800_000
      ),
      orientation: {
        heading: 0,
        pitch: -CesiumMath.toRadians(45),
        roll: 0,
      },
      duration: 2.0,
    })
  }, [flyToTelescope])

  return (
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
    >
      <SatelliteLayer
        positions={satPositions}
        selectedId={selectedSatId}
        onSelect={onSelectSat}
      />
      <TelescopeLayer
        telescopes={telescopes}
        selectedId={selectedTelescopeId}
        onSelect={onSelectTelescope}
      />
      <GroundTrack noradId={selectedSatId ?? null} />
      <HistoricalTrail noradId={selectedSatId ?? null} />
      <ReflectionOverlay positions={satPositions} reflectingIds={reflectingIds} />
      <ReflectionRay
        satPositions={satPositions}
        reflectingIds={reflectingIds}
        telescope={telescopes.find(t => t.telescope_id === selectedTelescopeId) ?? null}
        sunDirection={sunDirection}
      />
    </Viewer>
  )
}
