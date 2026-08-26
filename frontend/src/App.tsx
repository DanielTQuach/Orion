import { useState, useMemo } from 'react'
import Globe from '@/components/Globe'
import TelescopeSearch from '@/components/TelescopeSearch'
import FilterPanel from '@/components/FilterPanel'
import InfoPanel from '@/components/InfoPanel'
import { useSatellites } from '@/hooks/useSatellites'
import { useTelescopes } from '@/hooks/useTelescopes'
import { useSatPositions } from '@/hooks/useSatPositions'
import { useReflections } from '@/hooks/useReflections'
import type { SatelliteFilters } from '@/hooks/useSatellites'
import type { Telescope } from '@/hooks/useTelescopes'
import './App.css'

export default function App() {
  const [filters, setFilters] = useState<SatelliteFilters>({})
  const [selectedSatId, setSelectedSatId] = useState<number | null>(null)
  const [selectedTelescopeId, setSelectedTelescopeId] = useState<string | null>(null)
  const [flyToTelescope, setFlyToTelescope] = useState<Telescope | null>(null)

  // Data hooks
  const { satellites } = useSatellites(filters)
  const { telescopes } = useTelescopes()

  // Extract NORAD IDs to propagate
  const noradIds = useMemo(() => satellites.map(s => s.norad_id), [satellites])
  const { positions: satPositions } = useSatPositions(noradIds)

  // Reflection events for selected telescope
  const { reflectingIds, refetch: refetchReflections } = useReflections(selectedTelescopeId)

  // Trigger a scan when a telescope is selected
  const runScan = async (telescopeId: string) => {
    await fetch('/api/reflections/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telescope_id: telescopeId, hours_ahead: 1.0 }),
    })
    refetchReflections()
  }

  const handleTelescopeSelect = (telescope: Telescope) => {
    setSelectedTelescopeId(telescope.telescope_id)
    setFlyToTelescope(telescope)
    runScan(telescope.telescope_id)
  }

  const selectedSatPosition = selectedSatId ? satPositions.get(selectedSatId) : null
  const selectedTelescope   = selectedTelescopeId
    ? telescopes.find(t => t.telescope_id === selectedTelescopeId) ?? null
    : null

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000', position: 'relative' }}>
      <Globe
        satPositions={satPositions}
        telescopes={telescopes}
        selectedSatId={selectedSatId}
        selectedTelescopeId={selectedTelescopeId}
        onSelectSat={setSelectedSatId}
        onSelectTelescope={setSelectedTelescopeId}
        flyToTelescope={flyToTelescope}
        reflectingIds={reflectingIds}
      />
      <TelescopeSearch
        onSelect={handleTelescopeSelect}
        selectedId={selectedTelescopeId}
      />
      <FilterPanel filters={filters} onChange={setFilters} />
      <InfoPanel
        satellite={selectedSatPosition}
        telescope={selectedTelescope}
        onClose={() => { setSelectedSatId(null); setSelectedTelescopeId(null) }}
      />
    </div>
  )
}
