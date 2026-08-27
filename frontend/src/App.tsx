import { useState, useMemo, useEffect } from 'react'
import { OrbitalVisualizer } from '@/components/OrbitalVisualizer'
import { Panel, Stat, Bar } from '@/components/dashboard-parts'
import TleStatusBanner from '@/components/TleStatusBanner'
import NearbyPanel from '@/components/NearbyPanel'
import FilterPanel from '@/components/FilterPanel'
import TimelineScrubber from '@/components/TimelineScrubber'
import {
  telescopes as mockTelescopes,
  satellites as mockSatellites,
  incidents,
  interferenceByHour,
  fleetTotals,
  fmt,
  fmtCompact,
} from '@/lib/mission-data'
import { cn } from '@/lib/utils'
import { useSatellites } from '@/hooks/useSatellites'
import { useTelescopes } from '@/hooks/useTelescopes'
import { useSatPositions } from '@/hooks/useSatPositions'
import { useReflections } from '@/hooks/useReflections'
import type { SatelliteFilters } from '@/hooks/useSatellites'
import type { Telescope } from '@/hooks/useTelescopes'

interface SunDirection {
  x: number
  y: number
  z: number
}

export default function App() {
  const [filters, setFilters] = useState<SatelliteFilters>({})
  const [selectedSatId, setSelectedSatId] = useState<number | null>(null)
  const [selectedTelescopeId, setSelectedTelescopeId] = useState<string | null>(null)
  const [flyToTelescope, setFlyToTelescope] = useState<Telescope | null>(null)
  const [predicting, setPredicting] = useState(false)
  const [sunDirection, setSunDirection] = useState<SunDirection | null>(null)

  const { satellites } = useSatellites(filters)
  const { telescopes, loading: telescopesLoading } = useTelescopes()
  const noradIds = useMemo(() => satellites.map(s => s.norad_id), [satellites])
  const { positions: satPositions } = useSatPositions(noradIds)
  const { events, reflectingIds, refetch: refetchReflections } = useReflections(selectedTelescopeId)

  // Default to first live telescope once loaded
  useEffect(() => {
    if (!selectedTelescopeId && telescopes.length > 0) {
      setSelectedTelescopeId(telescopes[0]!.telescope_id)
    }
  }, [telescopes, selectedTelescopeId])

  useEffect(() => {
    const load = () =>
      fetch('/api/sun')
        .then(r => (r.ok ? r.json() : null))
        .then(d => d && setSunDirection({ x: d.x, y: d.y, z: d.z }))
        .catch(() => {})
    load()
    const t = setInterval(load, 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [])

  const selectedTelescope = useMemo(
    () => telescopes.find(t => t.telescope_id === selectedTelescopeId) ?? null,
    [telescopes, selectedTelescopeId],
  )

  // Scaffold telemetry mapped onto the selected live telescope slot
  const mockIndex = Math.max(
    0,
    telescopes.findIndex(t => t.telescope_id === selectedTelescopeId),
  )
  const mockTelemetry = mockTelescopes[mockIndex % mockTelescopes.length]!
  const cleanPct =
    mockTelemetry.imagesCaptured > 0
      ? Math.round((mockTelemetry.cleanImages / mockTelemetry.imagesCaptured) * 1000) / 10
      : 0

  const selectedIncidents = incidents.slice(0, 8)

  const runScan = async (telescopeId: string) => {
    await fetch('/api/reflections/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telescope_id: telescopeId, hours_ahead: 1.0 }),
    })
    refetchReflections()
  }

  const runPredict = async () => {
    if (!selectedTelescopeId || predicting) return
    setPredicting(true)
    await fetch('/api/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telescope_id: selectedTelescopeId, hours_ahead: 24 }),
    })
    setTimeout(() => {
      setPredicting(false)
      refetchReflections()
    }, 3000)
  }

  const handleTelescopeSelect = (telescope: Telescope) => {
    setSelectedTelescopeId(telescope.telescope_id)
    setFlyToTelescope(telescope)
    runScan(telescope.telescope_id)
  }

  const utcNow = new Date().toISOString().slice(11, 19)

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background text-foreground">
      <TleStatusBanner />

      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-full border border-primary/60 bg-primary/10">
            <div className="h-2.5 w-2.5 rounded-full bg-primary" />
          </div>
          <h1 className="font-display text-sm font-semibold uppercase tracking-[0.14em] text-foreground">
            Orion
          </h1>
          <span className="hidden font-mono text-[10px] text-muted-foreground sm:inline">
            TELESCOPE / SATELLITE INTERFERENCE MONITOR
          </span>
        </div>
        <div className="flex items-center gap-4 font-mono text-[10px] text-muted-foreground">
          <span className="hidden md:inline">UTC {utcNow}</span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-hud-cyan" />
            SYSTEM NOMINAL
          </span>
        </div>
      </header>

      <div className="grid shrink-0 grid-cols-2 gap-2 border-b border-border bg-card px-3 py-2 md:grid-cols-4">
        <Stat label="Fleet distance" value={fmtCompact(fleetTotals.distanceTraveledKm)} unit="km" sub="since deployment" />
        <Stat label="Images captured" value={fmt(fleetTotals.imagesCaptured)} sub={`${fmt(fleetTotals.cleanImages)} clean`} />
        <Stat label="Reflection hits" value={fmt(fleetTotals.reflectionHits)} tone="amber" sub="glare events" />
        <Stat label="FOV blocked" value={fmt(fleetTotals.fovBlocked)} tone="red" sub="physical occlusions" />
      </div>

      <main className="grid min-h-0 flex-1 gap-2 p-2 lg:grid-cols-[280px_1fr_340px]">
        <Panel title="Telescopes" meta={`${telescopes.length} active`} className="h-full">
          <div className="space-y-2">
            {telescopesLoading && (
              <p className="font-mono text-[11px] text-muted-foreground">Loading telescopes…</p>
            )}
            {telescopes.map(t => {
              const active = t.telescope_id === selectedTelescopeId
              return (
                <button
                  key={t.telescope_id}
                  type="button"
                  onClick={() => handleTelescopeSelect(t)}
                  className={cn(
                    'w-full rounded-sm border p-2.5 text-left transition-colors',
                    active
                      ? 'border-primary/60 bg-primary/10'
                      : 'border-border/60 bg-muted/40 hover:border-primary/40 hover:bg-muted',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-foreground">{t.telescope_id}</span>
                    <span className="h-1.5 w-1.5 rounded-full bg-hud-cyan" />
                  </div>
                  <div className="mt-1 text-[13px] font-medium text-foreground">{t.name}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    {t.lat.toFixed(2)}°, {t.lon.toFixed(2)}° · {Math.round(t.alt_m)} m
                  </div>
                </button>
              )
            })}
          </div>
        </Panel>

        <Panel
          title="Orbital visualizer"
          meta={selectedTelescope ? selectedTelescope.name : 'live track'}
          className="relative h-full"
          bodyClassName="relative min-h-0 flex-1 overflow-hidden p-0"
        >
          <div className="hud-grid pointer-events-none absolute inset-0 opacity-40" />
          <div className="relative z-10 h-full min-h-0 w-full">
            <OrbitalVisualizer
              satPositions={satPositions}
              telescopes={telescopes}
              selectedSatId={selectedSatId}
              selectedTelescopeId={selectedTelescopeId}
              onSelectSat={setSelectedSatId}
              onSelectTelescope={setSelectedTelescopeId}
              flyToTelescope={flyToTelescope}
              reflectingIds={reflectingIds}
              sunDirection={sunDirection}
            />
          </div>

          <div className="pointer-events-none absolute inset-x-0 top-2 z-20 flex justify-end px-2">
            <div className="pointer-events-auto">
              <FilterPanel filters={filters} onChange={setFilters} />
            </div>
          </div>

          <div className="pointer-events-none absolute right-2 top-14 z-20 max-h-[calc(100%-5rem)]">
            <div className="pointer-events-auto">
              <NearbyPanel
                telescopeId={selectedTelescopeId}
                selectedSatId={selectedSatId}
                onSelectSat={setSelectedSatId}
              />
            </div>
          </div>

          {selectedTelescopeId && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20">
              <div className="pointer-events-auto">
                <TimelineScrubber
                  events={events}
                  telescopeId={selectedTelescopeId}
                  onPredict={runPredict}
                  predicting={predicting}
                />
              </div>
            </div>
          )}
        </Panel>

        <div className="flex h-full min-h-0 flex-col gap-2">
          <Panel
            title="Selected telemetry"
            meta={selectedTelescope?.telescope_id ?? mockTelemetry.id}
            className="shrink-0"
          >
            <div className="grid grid-cols-2 gap-2">
              <div className="panel col-span-2 rounded-sm p-2">
                <div className="font-mono text-[10px] uppercase text-muted-foreground">Clean image rate</div>
                <div className="mt-1 flex items-end justify-between">
                  <span className="font-mono text-xl text-hud-cyan">{cleanPct}%</span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {fmt(mockTelemetry.cleanImages)} / {fmt(mockTelemetry.imagesCaptured)}
                  </span>
                </div>
                <Bar value={mockTelemetry.cleanImages} max={mockTelemetry.imagesCaptured} tone="cyan" />
              </div>
              <Stat label="Distance" value={fmtCompact(mockTelemetry.distanceTraveledKm)} unit="km" tone="plain" />
              <Stat label="Exposure" value={fmt(mockTelemetry.exposureMinutes)} unit="min" tone="plain" />
              <Stat label="Reflections" value={fmt(mockTelemetry.reflectionHits)} tone="amber" />
              <Stat label="Blocked FOV" value={fmt(mockTelemetry.fovBlocked)} tone="red" />
            </div>
          </Panel>

          <Panel title="Interference trend" className="shrink-0">
            <div className="space-y-2">
              {interferenceByHour.map(h => {
                const max = 30
                return (
                  <div key={h.hour} className="flex items-center gap-2">
                    <span className="w-8 font-mono text-[10px] text-muted-foreground">{h.hour}</span>
                    <div className="flex flex-1 gap-px">
                      <div
                        className="h-2 bg-hud-amber"
                        style={{ width: `${(h.reflections / max) * 100}%` }}
                        title={`reflections ${h.reflections}`}
                      />
                      <div
                        className="ml-0.5 h-2 bg-hud-red"
                        style={{ width: `${(h.blocks / max) * 100}%` }}
                        title={`blocks ${h.blocks}`}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-3 flex items-center gap-3 font-mono text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-2 w-2 bg-hud-amber" /> Reflection</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 bg-hud-red" /> FOV block</span>
            </div>
          </Panel>

          <Panel title="Incident log" meta={selectedIncidents.length} className="min-h-0 flex-1">
            <div className="space-y-1.5">
              {selectedIncidents.map(ev => {
                const sat = mockSatellites.find(s => s.id === ev.satelliteId)
                return (
                  <div
                    key={ev.id}
                    className="flex items-start justify-between rounded-sm border border-border/50 bg-muted/30 px-2 py-1.5"
                  >
                    <div>
                      <div className="font-mono text-[10px] text-muted-foreground">{ev.timestamp}</div>
                      <div className="text-xs text-foreground">
                        {ev.kind === 'reflection' ? 'Reflection' : 'FOV blocked'}
                        {sat ? ` · ${sat.name}` : null}
                      </div>
                    </div>
                    <div
                      className={cn(
                        'rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase',
                        ev.severity === 'severe'
                          ? 'bg-hud-red/15 text-hud-red'
                          : ev.severity === 'moderate'
                            ? 'bg-hud-amber/15 text-hud-amber'
                            : 'bg-hud-cyan/15 text-hud-cyan',
                      )}
                    >
                      {ev.severity}
                    </div>
                  </div>
                )
              })}
            </div>
          </Panel>
        </div>
      </main>
    </div>
  )
}
