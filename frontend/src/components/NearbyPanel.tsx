/**
 * NearbyPanel — shows the closest satellites to the selected telescope,
 * sorted by 3D distance. Clicking a row selects that satellite.
 */
import { useEffect, useState } from 'react'

interface NearbySat {
  norad_id: number
  name: string
  category: string | null
  operator: string | null
  lat: number
  lon: number
  alt_km: number
  distance_km: number
}

interface Props {
  telescopeId: string | null
  selectedSatId: number | null
  onSelectSat: (id: number) => void
}

export default function NearbyPanel({ telescopeId, selectedSatId, onSelectSat }: Props) {
  const [satellites, setSatellites] = useState<NearbySat[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!telescopeId) { setSatellites([]); return }
    setLoading(true)
    fetch(`/api/telescopes/${encodeURIComponent(telescopeId)}/nearby?limit=10`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setSatellites(d.satellites))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [telescopeId])

  if (!telescopeId) return null

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.title}>🛰 Nearby Satellites</span>
        <span style={styles.sub}>{telescopeId}</span>
      </div>

      {loading && <p style={styles.muted}>Loading…</p>}

      {!loading && satellites.length === 0 && (
        <p style={styles.muted}>No satellites with cached TLEs.</p>
      )}

      <ul style={styles.list}>
        {satellites.map((sat, i) => {
          const isSelected = sat.norad_id === selectedSatId
          return (
            <li
              key={sat.norad_id}
              style={{ ...styles.item, ...(isSelected ? styles.itemSelected : {}) }}
              onClick={() => onSelectSat(sat.norad_id)}
            >
              <div style={styles.rank}>#{i + 1}</div>
              <div style={styles.info}>
                <div style={styles.name}>{sat.name}</div>
                <div style={styles.meta}>
                  {sat.category ?? sat.operator ?? '—'}
                  {' · '}
                  <span style={styles.dist}>{sat.distance_km.toLocaleString()} km away</span>
                  {' · '}
                  {sat.alt_km.toFixed(0)} km alt
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'relative',
    width: '100%',
    maxHeight: 220,
    overflowY: 'auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  title:  { fontSize: 13, fontWeight: 600 },
  sub:    { fontSize: 11, color: '#8ba0b4' },
  muted:  { fontSize: 12, color: '#8ba0b4', margin: '4px 0' },
  list:   { listStyle: 'none', padding: 0, margin: 0 },
  item: {
    display: 'flex',
    gap: 10,
    alignItems: 'flex-start',
    padding: '7px 0',
    borderBottom: '1px solid #1a2a3a',
    cursor: 'pointer',
  },
  itemSelected: {
    borderLeft: '3px solid #f59e0b',
    paddingLeft: 6,
    marginLeft: -6,
  },
  rank: {
    fontSize: 11,
    color: '#8ba0b4',
    minWidth: 22,
    paddingTop: 2,
    flexShrink: 0,
  },
  info:   { flex: 1, minWidth: 0 },
  name:   { fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' },
  meta:   { fontSize: 11, color: '#8ba0b4', marginTop: 2 },
  dist:   { color: '#3b82d4' },
}
