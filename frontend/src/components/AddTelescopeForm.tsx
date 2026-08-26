/**
 * Manual telescope entry form.
 * Posts to /api/telescopes (to be added) or displays a tip about IAU codes.
 */
import { useState } from 'react'

interface NewTelescope {
  telescope_id: string
  name: string
  lat: string
  lon: string
  alt_m: string
  operator: string
}

const EMPTY: NewTelescope = { telescope_id: '', name: '', lat: '', lon: '', alt_m: '', operator: '' }

interface Props {
  onAdded?: () => void
  onClose: () => void
}

export default function AddTelescopeForm({ onAdded, onClose }: Props) {
  const [form, setForm] = useState<NewTelescope>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (k: keyof NewTelescope) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const submit = async () => {
    if (!form.telescope_id || !form.name || !form.lat || !form.lon || !form.alt_m) {
      setError('ID, name, lat, lon, and altitude are required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/telescopes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telescope_id: form.telescope_id.toUpperCase(),
          name:         form.name,
          lat:          parseFloat(form.lat),
          lon:          parseFloat(form.lon),
          alt_m:        parseFloat(form.alt_m),
          operator:     form.operator || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.detail ?? `HTTP ${res.status}`)
      }
      onAdded?.()
      onClose()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h3 style={styles.title}>Add Telescope</h3>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>

        {[
          { label: 'ID (e.g. MY1)',   key: 'telescope_id' as const, placeholder: 'MY1' },
          { label: 'Name',            key: 'name'         as const, placeholder: 'My Observatory' },
          { label: 'Latitude (°)',    key: 'lat'          as const, placeholder: '40.7128' },
          { label: 'Longitude (°)',   key: 'lon'          as const, placeholder: '-74.0060' },
          { label: 'Altitude (m)',    key: 'alt_m'        as const, placeholder: '10' },
          { label: 'Operator',        key: 'operator'     as const, placeholder: 'Optional' },
        ].map(({ label, key, placeholder }) => (
          <div key={key} style={styles.field}>
            <label style={styles.label}>{label}</label>
            <input
              style={styles.input}
              placeholder={placeholder}
              value={form[key]}
              onChange={set(key)}
            />
          </div>
        ))}

        {error && <p style={styles.error}>{error}</p>}

        <div style={styles.actions}>
          <button style={styles.btnSave} onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : 'Add Telescope'}
          </button>
          <button style={styles.btnCancel} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.6)',
    zIndex: 200,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modal: {
    background: '#0d1520',
    border: '1px solid #2a3a4a',
    borderRadius: 8,
    padding: 20,
    width: 340,
    color: '#e0e8f0',
    fontFamily: 'system-ui, sans-serif',
  },
  header:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title:   { margin: 0, fontSize: 15, fontWeight: 600 },
  close:   { background: 'none', border: 'none', color: '#8ba0b4', fontSize: 16, cursor: 'pointer' },
  field:   { marginBottom: 10 },
  label:   { display: 'block', fontSize: 11, color: '#8ba0b4', marginBottom: 4, textTransform: 'uppercase' as const },
  input: {
    width: '100%', padding: '6px 10px', borderRadius: 4,
    border: '1px solid #2a3a4a', background: '#050e1a',
    color: '#e0e8f0', fontSize: 13, boxSizing: 'border-box' as const,
  },
  error:     { color: '#f87171', fontSize: 12, margin: '8px 0 0' },
  actions:   { display: 'flex', gap: 10, marginTop: 14 },
  btnSave: {
    flex: 1, padding: '7px 0', borderRadius: 4, border: 'none',
    background: '#3b82d4', color: '#fff', fontSize: 13, cursor: 'pointer',
  },
  btnCancel: {
    flex: 1, padding: '7px 0', borderRadius: 4,
    border: '1px solid #2a3a4a', background: 'transparent',
    color: '#8ba0b4', fontSize: 13, cursor: 'pointer',
  },
}
