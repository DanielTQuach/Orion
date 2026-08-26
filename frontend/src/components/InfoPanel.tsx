/**
 * Displays selected satellite or telescope details in a bottom panel.
 */
import type { SatPosition } from '@/hooks/useSatPositions'
import type { Telescope } from '@/hooks/useTelescopes'

interface Props {
  satellite?: SatPosition | null
  telescope?: Telescope | null
  onClose: () => void
}

export default function InfoPanel({ satellite, telescope, onClose }: Props) {
  if (!satellite && !telescope) return null

  return (
    <div style={styles.panel}>
      <button style={styles.close} onClick={onClose}>✕</button>

      {satellite && (
        <>
          <div style={styles.tag}>SATELLITE</div>
          <h3 style={styles.name}>{satellite.name}</h3>
          <div style={styles.grid}>
            <Stat label="NORAD ID"  value={String(satellite.norad_id)} />
            <Stat label="Latitude"  value={`${satellite.lat.toFixed(4)}°`} />
            <Stat label="Longitude" value={`${satellite.lon.toFixed(4)}°`} />
            <Stat label="Altitude"  value={`${satellite.alt_km.toFixed(1)} km`} />
            <Stat label="Updated"   value={new Date(satellite.timestamp).toUTCString()} />
          </div>
        </>
      )}

      {telescope && (
        <>
          <div style={{ ...styles.tag, background: '#16a34a' }}>TELESCOPE</div>
          <h3 style={styles.name}>{telescope.name}</h3>
          <div style={styles.grid}>
            <Stat label="ID"        value={telescope.telescope_id} />
            <Stat label="Latitude"  value={`${telescope.lat.toFixed(4)}°`} />
            <Stat label="Longitude" value={`${telescope.lon.toFixed(4)}°`} />
            <Stat label="Altitude"  value={`${telescope.alt_m} m`} />
            {telescope.operator && <Stat label="Operator" value={telescope.operator} />}
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, color: '#8ba0b4', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <span style={{ fontSize: 13, color: '#e0e8f0', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'absolute',
    bottom: 24,
    left: '50%',
    transform: 'translateX(-50%)',
    minWidth: 420,
    background: 'rgba(15,20,30,0.92)',
    border: '1px solid #2a3a4a',
    borderRadius: 8,
    padding: '14px 18px',
    zIndex: 100,
    color: '#e0e8f0',
    fontFamily: 'system-ui, sans-serif',
  },
  close: {
    position: 'absolute',
    top: 10,
    right: 12,
    background: 'none',
    border: 'none',
    color: '#8ba0b4',
    fontSize: 14,
    cursor: 'pointer',
  },
  tag: {
    display: 'inline-block',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.08em',
    background: '#1d4ed8',
    color: '#fff',
    borderRadius: 3,
    padding: '2px 7px',
    marginBottom: 6,
  },
  name: { margin: '0 0 12px', fontSize: 15, fontWeight: 600 },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
    gap: '10px 20px',
  },
}
