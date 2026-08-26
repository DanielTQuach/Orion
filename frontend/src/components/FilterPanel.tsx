/**
 * Filter panel — toggles for category, operator, and is_reflective.
 * Calls onChange whenever any filter changes.
 */
import type { SatelliteFilters } from '@/hooks/useSatellites'

const CATEGORIES = ['Space Telescope', 'Space Station', 'Starlink', 'OneWeb', 'Active']
const OPERATORS  = ['NASA', 'SpaceX', 'ESA', 'OneWeb', 'Multi-national', 'NASA/ESA/CSA']

interface Props {
  filters: SatelliteFilters
  onChange: (f: SatelliteFilters) => void
}

export default function FilterPanel({ filters, onChange }: Props) {
  const set = (patch: Partial<SatelliteFilters>) => onChange({ ...filters, ...patch })
  const clear = (key: keyof SatelliteFilters) => {
    const next = { ...filters }
    delete next[key]
    onChange(next)
  }

  return (
    <div style={styles.panel}>
      <h2 style={styles.title}>Filters</h2>

      {/* Category */}
      <label style={styles.label}>Category</label>
      <select
        style={styles.select}
        value={filters.category ?? ''}
        onChange={e => e.target.value ? set({ category: e.target.value }) : clear('category')}
      >
        <option value=''>All</option>
        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
      </select>

      {/* Operator */}
      <label style={styles.label}>Operator</label>
      <select
        style={styles.select}
        value={filters.operator ?? ''}
        onChange={e => e.target.value ? set({ operator: e.target.value }) : clear('operator')}
      >
        <option value=''>All</option>
        {OPERATORS.map(o => <option key={o} value={o}>{o}</option>)}
      </select>

      {/* Reflective toggle */}
      <label style={styles.checkRow}>
        <input
          type='checkbox'
          checked={filters.is_reflective ?? false}
          onChange={e => e.target.checked ? set({ is_reflective: true }) : clear('is_reflective')}
          style={{ marginRight: 8 }}
        />
        Reflective only
      </label>

      {/* Clear all */}
      {(filters.category || filters.operator || filters.is_reflective !== undefined) && (
        <button style={styles.clearBtn} onClick={() => onChange({})}>
          Clear filters
        </button>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 210,
    background: 'rgba(15,20,30,0.88)',
    border: '1px solid #2a3a4a',
    borderRadius: 8,
    padding: 14,
    zIndex: 100,
    color: '#e0e8f0',
    fontFamily: 'system-ui, sans-serif',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  title:    { margin: 0, fontSize: 14, fontWeight: 600 },
  label:    { fontSize: 12, color: '#8ba0b4', marginBottom: -4 },
  select: {
    width: '100%',
    padding: '5px 8px',
    borderRadius: 4,
    border: '1px solid #2a3a4a',
    background: '#0d1520',
    color: '#e0e8f0',
    fontSize: 13,
  },
  checkRow: { fontSize: 13, display: 'flex', alignItems: 'center', cursor: 'pointer' },
  clearBtn: {
    marginTop: 4,
    padding: '5px 10px',
    borderRadius: 4,
    border: '1px solid #3b82d4',
    background: 'transparent',
    color: '#3b82d4',
    fontSize: 12,
    cursor: 'pointer',
  },
}
