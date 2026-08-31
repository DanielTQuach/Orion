/**
 * RagSchedulePanel — Step 4 of the Orion workflow.
 *
 * Lets the user enter a target RA/Dec + science goal, run the 5-stage RAG
 * pipeline, and see the Granite-chosen slot with safety check breakdown.
 */
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useRagSchedule, type RagResult, type ValidationChecks } from '@/hooks/useRagSchedule'

// ── Small helpers ─────────────────────────────────────────────────────────────

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
        {label}
      </label>
      {children}
    </div>
  )
}

function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
  step,
  min,
  max,
}: {
  value: string | number
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  step?: string
  min?: number
  max?: number
}) {
  return (
    <input
      type={type}
      step={step}
      min={min}
      max={max}
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      className="rounded-md border border-white/12 bg-white/4 px-2.5 py-1.5 font-mono text-[11px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-violet/60"
    />
  )
}

function CheckRow({ label, passed, detail }: { label: string; passed: boolean; detail?: string }) {
  return (
    <div className="flex items-start gap-2 py-0.5">
      <span
        className={cn(
          'mt-0.5 shrink-0 font-mono text-[10px]',
          passed ? 'text-signal' : 'text-critical',
        )}
      >
        {passed ? '✓' : '✗'}
      </span>
      <div className="min-w-0">
        <span className="font-mono text-[10px] text-foreground">{label}</span>
        {detail && (
          <p className="font-mono text-[9px] text-muted-foreground">{detail}</p>
        )}
      </div>
    </div>
  )
}

function RiskBadge({ risk }: { risk: string | null }) {
  if (!risk) return null
  const colour =
    risk === 'low'
      ? 'border-signal/30 bg-signal/10 text-signal'
      : risk === 'medium'
        ? 'border-brass/30 bg-brass/10 text-brass'
        : 'border-critical/30 bg-critical/10 text-critical'
  return (
    <span className={cn('rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase', colour)}>
      {risk} risk
    </span>
  )
}

// ── Approved result card ──────────────────────────────────────────────────────

function ResultCard({ result }: { result: RagResult }) {
  const checks: ValidationChecks = result.validation_checks ?? {}

  return (
    <div className="flex flex-col gap-3">
      {/* Status banner */}
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg border px-3 py-2',
          result.approved
            ? 'border-signal/30 bg-signal/8'
            : 'border-critical/30 bg-critical/8',
        )}
      >
        <span
          className={cn(
            'font-mono text-[11px] font-semibold uppercase tracking-wider',
            result.approved ? 'text-signal' : 'text-critical',
          )}
        >
          {result.approved ? '✓ Maneuver Approved' : '✗ Maneuver Rejected'}
        </span>
        {result.contamination_risk && (
          <span className="ml-auto">
            <RiskBadge risk={result.contamination_risk} />
          </span>
        )}
      </div>

      {/* Chosen coordinates */}
      {result.chosen_ra_deg != null && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-white/8 bg-panel/60 px-3 py-2">
            <p className="font-mono text-[9px] tracking-[0.18em] text-muted-foreground uppercase">
              Chosen RA
            </p>
            <p className="mt-1 font-mono text-base tabular-nums text-violet">
              {result.chosen_ra_deg.toFixed(4)}°
            </p>
          </div>
          <div className="rounded-lg border border-white/8 bg-panel/60 px-3 py-2">
            <p className="font-mono text-[9px] tracking-[0.18em] text-muted-foreground uppercase">
              Chosen Dec
            </p>
            <p className="mt-1 font-mono text-base tabular-nums text-violet">
              {result.chosen_dec_deg!.toFixed(4)}°
            </p>
          </div>
        </div>
      )}

      {/* Granite justification */}
      {result.justification && (
        <div className="rounded-lg border border-violet/20 bg-violet/5 px-3 py-2.5">
          <p className="mb-1 font-mono text-[9px] tracking-[0.18em] text-violet/70 uppercase">
            Granite Justification
          </p>
          <p className="text-[11px] leading-relaxed text-foreground/90">
            {result.justification}
          </p>
          {result.granite_confidence != null && (
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/8">
                <div
                  className="h-full bg-violet"
                  style={{ width: `${result.granite_confidence * 100}%` }}
                />
              </div>
              <span className="font-mono text-[9px] text-violet/70">
                {(result.granite_confidence * 100).toFixed(0)}% confidence
              </span>
            </div>
          )}
        </div>
      )}

      {/* Keep-out geometry */}
      {result.keepout_geometry?.sun && (
        <div className="rounded-lg border border-white/8 bg-panel/40 px-3 py-2">
          <p className="mb-1.5 font-mono text-[9px] tracking-[0.18em] text-muted-foreground uppercase">
            Keep-out Vectors
          </p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            <span className="font-mono text-[9px] text-muted-foreground">
              ☀ Sun RA {result.keepout_geometry.sun.ra_deg.toFixed(1)}°
            </span>
            <span className="font-mono text-[9px] text-muted-foreground">
              Dec {result.keepout_geometry.sun.dec_deg.toFixed(1)}°
            </span>
            <span className="font-mono text-[9px] text-muted-foreground">
              ◑ Moon RA {result.keepout_geometry.moon.ra_deg.toFixed(1)}°
            </span>
            <span className="font-mono text-[9px] text-muted-foreground">
              Dec {result.keepout_geometry.moon.dec_deg.toFixed(1)}°
            </span>
          </div>
        </div>
      )}

      {/* Validation checks */}
      {Object.keys(checks).length > 0 && (
        <div className="rounded-lg border border-white/8 bg-panel/40 px-3 py-2">
          <p className="mb-1.5 font-mono text-[9px] tracking-[0.18em] text-muted-foreground uppercase">
            Safety Checks
          </p>
          {checks.coordinate_sanity && (
            <CheckRow
              label="Coordinate sanity"
              passed={checks.coordinate_sanity.passed}
              detail={checks.coordinate_sanity.issues.join('; ') || undefined}
            />
          )}
          {checks.keepout && (
            <CheckRow
              label={`Keep-out  (☀ ${checks.keepout.sun_sep_deg.toFixed(1)}°  ◑ ${checks.keepout.moon_sep_deg.toFixed(1)}°)`}
              passed={checks.keepout.safe}
              detail={checks.keepout.violations.join('; ') || undefined}
            />
          )}
          {checks.earth_limb && (
            <CheckRow
              label="Earth-limb clearance"
              passed={checks.earth_limb.passed}
              detail={checks.earth_limb.issues.join('; ') || undefined}
            />
          )}
          {checks.contamination && (
            <CheckRow
              label="Sat contamination window"
              passed={checks.contamination.passed}
              detail={checks.contamination.issues.join('; ') || undefined}
            />
          )}
          {checks.granite_confidence && (
            <CheckRow
              label={`Granite confidence ≥ ${checks.granite_confidence.threshold}`}
              passed={checks.granite_confidence.passed}
              detail={`value: ${checks.granite_confidence.value.toFixed(2)}`}
            />
          )}
        </div>
      )}

      {/* Violations list (rejection mode) */}
      {result.violations.length > 0 && (
        <div className="rounded-lg border border-critical/25 bg-critical/5 px-3 py-2">
          <p className="mb-1 font-mono text-[9px] tracking-[0.18em] text-critical/70 uppercase">
            Violations
          </p>
          <ul className="flex flex-col gap-0.5">
            {result.violations.map((v, i) => (
              <li key={i} className="font-mono text-[10px] text-critical/90">
                · {v}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Candidate stats */}
      {result.candidate_stats?.total_before_filter != null && (
        <p className="font-mono text-[9px] text-muted-foreground/60">
          {result.candidate_stats.safe_after_filter} safe slots from{' '}
          {result.candidate_stats.total_before_filter} candidates ·{' '}
          stage: {result.stage_reached}
        </p>
      )}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

const MISSIONS = ['HST', 'JWST', 'TESS', 'KEPLER'] as const

export default function RagSchedulePanel() {
  const { schedule, result, loading, error, reset } = useRagSchedule()

  const [ra, setRa]               = useState('')
  const [dec, setDec]             = useState('')
  const [goal, setGoal]           = useState('')
  const [priority, setPriority]   = useState('3')
  const [mission, setMission]     = useState<string>('HST')
  const [sunLimit, setSunLimit]   = useState('50')
  const [moonLimit, setMoonLimit] = useState('10')

  const canSubmit =
    !loading &&
    ra.trim() !== '' &&
    dec.trim() !== '' &&
    goal.trim().length >= 5

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    schedule({
      ra_deg:        parseFloat(ra),
      dec_deg:       parseFloat(dec),
      science_goal:  goal.trim(),
      priority:      parseInt(priority, 10),
      mission,
      sun_limit_deg:  parseFloat(sunLimit),
      moon_limit_deg: parseFloat(moonLimit),
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Enter a target pointing and science goal. Granite will evaluate safe
        slots against live keep-out geometry and satellite contamination windows.
      </p>

      {/* Form */}
      {!result && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="RA (deg)">
              <Input
                type="number"
                step="0.0001"
                min={0}
                max={360}
                value={ra}
                onChange={setRa}
                placeholder="83.8221"
              />
            </Field>
            <Field label="Dec (deg)">
              <Input
                type="number"
                step="0.0001"
                min={-90}
                max={90}
                value={dec}
                onChange={setDec}
                placeholder="-5.3911"
              />
            </Field>
          </div>

          <Field label="Science goal">
            <textarea
              value={goal}
              onChange={e => setGoal(e.target.value)}
              placeholder="e.g. Observe diffraction spikes of Betelgeuse for dust shell mapping"
              rows={2}
              className="resize-none rounded-md border border-white/12 bg-white/4 px-2.5 py-1.5 font-mono text-[11px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-violet/60"
            />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Mission">
              <select
                value={mission}
                onChange={e => setMission(e.target.value)}
                className="rounded-md border border-white/12 bg-panel px-2.5 py-1.5 font-mono text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-violet/60"
              >
                {MISSIONS.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </Field>
            <Field label="Priority (1=high)">
              <Input
                type="number"
                min={1}
                max={5}
                step="1"
                value={priority}
                onChange={setPriority}
              />
            </Field>
          </div>

          {/* Advanced keep-out overrides (collapsed look) */}
          <details className="group">
            <summary className="cursor-pointer font-mono text-[9px] tracking-[0.15em] text-muted-foreground/60 uppercase hover:text-muted-foreground">
              ▸ Keep-out limits
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Field label="Sun exclusion (°)">
                <Input
                  type="number"
                  min={10}
                  max={180}
                  step="1"
                  value={sunLimit}
                  onChange={setSunLimit}
                />
              </Field>
              <Field label="Moon exclusion (°)">
                <Input
                  type="number"
                  min={1}
                  max={90}
                  step="1"
                  value={moonLimit}
                  onChange={setMoonLimit}
                />
              </Field>
            </div>
          </details>

          <button
            type="submit"
            disabled={!canSubmit}
            className={cn(
              'w-full rounded-lg px-3 py-2.5 font-mono text-[11px] font-semibold tracking-wide uppercase transition-colors',
              canSubmit
                ? 'border border-violet/40 bg-violet/20 text-violet hover:bg-violet/30'
                : 'cursor-not-allowed border border-white/10 bg-white/5 text-muted-foreground',
            )}
          >
            {loading ? 'Running pipeline…' : 'Run RAG Pipeline'}
          </button>

          {error && (
            <p className="rounded-md border border-critical/30 bg-critical/8 px-2.5 py-2 font-mono text-[10px] text-critical">
              {error}
            </p>
          )}
        </form>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col gap-2 rounded-lg border border-violet/20 bg-violet/5 px-3 py-4">
          <p className="font-mono text-[10px] text-violet animate-pulse">
            ① Fetching MAST targets + guide stars…
          </p>
          <p className="font-mono text-[10px] text-muted-foreground/50">
            ② Computing Sun / Moon keep-out vectors
          </p>
          <p className="font-mono text-[10px] text-muted-foreground/50">
            ③ Building RAG context
          </p>
          <p className="font-mono text-[10px] text-muted-foreground/50">
            ④ Granite LLM evaluation
          </p>
          <p className="font-mono text-[10px] text-muted-foreground/50">
            ⑤ Telemetry validation
          </p>
        </div>
      )}

      {/* Result */}
      {result && !loading && (
        <>
          <ResultCard result={result} />
          <button
            type="button"
            onClick={reset}
            className="w-full rounded-lg border border-white/10 bg-white/4 py-2 font-mono text-[10px] text-muted-foreground uppercase transition-colors hover:bg-white/8"
          >
            New request
          </button>
        </>
      )}
    </div>
  )
}
