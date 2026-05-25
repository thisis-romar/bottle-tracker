import { useState } from 'react'
import { calculateRefundCents, formatCents, refundRuleLabel } from '../utils/refund'
import type { Material } from '../db'
import type { OFFResult } from '../utils/offLookup'

export interface UnknownBarcodeResult {
  name: string
  material: Material
  volumeMl: number
  refundCents: 10 | 20
}

interface Props {
  barcode: string
  /** Pre-populated data from Open Food Facts (may be partial) */
  offResult?: OFFResult | null
  onSave: (result: UnknownBarcodeResult) => void
  onSkip: () => void
}

const PRESET_VOLUMES = [250, 330, 341, 355, 473, 500, 568, 630, 710, 750, 1000, 1500, 2000]

const MATERIAL_OPTIONS: { value: Material; label: string; icon: string }[] = [
  { value: 'aluminum', label: 'Can',     icon: '🥤' },
  { value: 'glass',    label: 'Glass',   icon: '🍾' },
  { value: 'plastic',  label: 'Plastic', icon: '🧴' },
  { value: 'tetra',    label: 'Tetra',   icon: '🧃' },
]

export default function UnknownBarcodeModal({ barcode, offResult, onSave, onSkip }: Props) {
  // Initialise from OFF prefill when available
  const [name,     setName]     = useState(offResult?.name ?? offResult?.brand ?? '')
  const [material, setMaterial] = useState<Material>(offResult?.material ?? 'aluminum')
  const [volumeMl, setVolumeMl] = useState(offResult?.volumeMl ?? 355)
  const [customVol, setCustomVol] = useState('')

  const refundCents = calculateRefundCents(material, volumeMl)
  const hasOFFData  = offResult && offResult.confidence !== 'miss'

  const handleSave = () => {
    onSave({ name: name.trim(), material, volumeMl, refundCents })
  }

  const handleVolumePreset = (v: number) => {
    setVolumeMl(v)
    setCustomVol('')
  }

  const handleCustomVol = (raw: string) => {
    setCustomVol(raw)
    const n = parseInt(raw, 10)
    if (!isNaN(n) && n > 0) setVolumeMl(n)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'flex-end'
    }}>
      <div className="slide-up" style={{
        background: '#fff', width: '100%',
        borderRadius: '20px 20px 0 0',
        padding: '20px 16px',
        paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
        maxHeight: '90vh', overflowY: 'auto'
      }}>
        {/* Drag handle */}
        <div style={{
          width: 40, height: 4, borderRadius: 2,
          background: '#e5e7eb', margin: '0 auto 16px'
        }} />

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17 }}>
              {hasOFFData ? 'Confirm Product' : 'Unknown Barcode'}
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', fontFamily: 'monospace', marginTop: 2 }}>
              {barcode}
            </div>
          </div>

          {/* OFF source badge */}
          {hasOFFData && (
            <div style={{
              background: offResult.confidence === 'full' ? '#dcfce7' : '#fef9c3',
              color: offResult.confidence === 'full' ? '#15803d' : '#92400e',
              borderRadius: 20, padding: '4px 10px',
              fontSize: 11, fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 4
            }}>
              <span>{offResult.confidence === 'full' ? '✓' : '~'}</span>
              Open Food Facts
              <ConfidenceDot confidence={offResult.confidence} />
            </div>
          )}
        </div>

        {/* OFF confidence explanation */}
        {hasOFFData && offResult.confidence !== 'full' && (
          <div style={{
            background: '#fef9c3', borderRadius: 8,
            padding: '8px 12px', marginBottom: 14,
            fontSize: 12, color: '#713f12'
          }}>
            {offResult.confidence === 'partial'
              ? '⚠️ Partial match — please verify the highlighted fields.'
              : '⚠️ Only the product name was found — please fill in size and type.'}
          </div>
        )}

        {/* Name */}
        <label style={labelStyle}>Product name (optional)</label>
        <input
          style={inputStyle}
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Heineken 500 mL"
          autoFocus={!hasOFFData}
        />

        {/* Material */}
        <label style={labelStyle}>
          Container type
          {hasOFFData && !offResult.material && <Required />}
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 16 }}>
          {MATERIAL_OPTIONS.map(opt => {
            const active = material === opt.value
            const fromOFF = offResult?.material === opt.value && offResult.confidence !== 'miss'
            return (
              <button
                key={opt.value}
                onClick={() => setMaterial(opt.value)}
                style={{
                  padding: '10px 4px', borderRadius: 10,
                  border: `2px solid ${active ? '#15803d' : '#e5e7eb'}`,
                  background: active ? '#dcfce7' : '#f9fafb',
                  color: active ? '#15803d' : '#374151',
                  cursor: 'pointer', fontSize: 11,
                  fontWeight: active ? 700 : 400,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', gap: 3,
                  position: 'relative'
                }}
              >
                <span style={{ fontSize: 22 }}>{opt.icon}</span>
                {opt.label}
                {fromOFF && active && (
                  <span style={{ fontSize: 9, color: '#15803d', fontWeight: 700 }}>OFF ✓</span>
                )}
              </button>
            )
          })}
        </div>

        {/* Volume presets */}
        <label style={labelStyle}>
          Volume (mL)
          {hasOFFData && !offResult.volumeMl && <Required />}
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {PRESET_VOLUMES.map(v => {
            const active = volumeMl === v && !customVol
            const fromOFF = offResult?.volumeMl === v && offResult.confidence !== 'miss'
            return (
              <button
                key={v}
                onClick={() => handleVolumePreset(v)}
                style={{
                  padding: '5px 10px', borderRadius: 8,
                  border: `2px solid ${active ? '#15803d' : fromOFF && !active ? '#fbbf24' : '#e5e7eb'}`,
                  background: active ? '#dcfce7' : '#f9fafb',
                  color: active ? '#15803d' : '#374151',
                  cursor: 'pointer', fontSize: 13,
                  fontWeight: active ? 700 : 400
                }}
              >
                {v}
              </button>
            )
          })}
        </div>
        <input
          type="number"
          value={customVol}
          onChange={e => handleCustomVol(e.target.value)}
          style={{ ...inputStyle, marginBottom: 16 }}
          placeholder="Custom mL…"
          min={1}
        />

        {/* Refund preview */}
        <div style={{
          background: '#f0fdf4', borderRadius: 10,
          padding: '10px 14px', marginBottom: 20,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div style={{ fontSize: 13, color: '#374151' }}>
            {refundRuleLabel(material)}
          </div>
          <div style={{ fontWeight: 700, fontSize: 20, color: '#15803d' }}>
            {formatCents(refundCents)}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onSkip} style={skipBtnStyle}>Skip</button>
          <button onClick={handleSave} style={saveBtnStyle}>
            Save &amp; Add ✓
          </button>
        </div>
      </div>
    </div>
  )
}

function ConfidenceDot({ confidence }: { confidence: OFFResult['confidence'] }) {
  const colors: Record<string, string> = {
    full: '#15803d',
    partial: '#d97706',
    'name-only': '#f59e0b',
    miss: '#9ca3af'
  }
  return (
    <span style={{
      display: 'inline-block', width: 7, height: 7,
      borderRadius: '50%', background: colors[confidence] ?? '#9ca3af'
    }} />
  )
}

function Required() {
  return (
    <span style={{ color: '#f59e0b', marginLeft: 4, fontSize: 12 }}>
      ✎ required
    </span>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600,
  color: '#374151', marginBottom: 6
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  borderRadius: 8, border: '1.5px solid #e5e7eb',
  fontSize: 15, outline: 'none', background: '#f9fafb',
  WebkitAppearance: 'none'
}
const skipBtnStyle: React.CSSProperties = {
  flex: 1, padding: '13px',
  borderRadius: 12, border: '1.5px solid #e5e7eb',
  background: '#fff', color: '#374151',
  fontSize: 15, fontWeight: 600, cursor: 'pointer'
}
const saveBtnStyle: React.CSSProperties = {
  flex: 2, padding: '13px',
  borderRadius: 12, border: 'none',
  background: '#15803d', color: '#fff',
  fontSize: 15, fontWeight: 700, cursor: 'pointer'
}
