import { useState } from 'react'
import { db } from '../db'
import { calculateRefundCents, formatCents, refundRuleLabel } from '../utils/refund'
import type { Material } from '../db'

interface Props {
  sessionKey: string
  onItemAdded: () => void
}

const MATERIAL_OPTIONS: { value: Material; label: string; icon: string }[] = [
  { value: 'aluminum', label: 'Can',      icon: '🥤' },
  { value: 'glass',    label: 'Glass',    icon: '🍾' },
  { value: 'plastic',  label: 'Plastic',  icon: '🧴' },
  { value: 'tetra',    label: 'Tetra Pak',icon: '🧃' },
]

const PRESET_VOLUMES = [250, 330, 341, 355, 473, 500, 568, 630, 710, 750, 1000, 1500, 2000]

export default function ManualEntryScreen({ sessionKey, onItemAdded }: Props) {
  const [material, setMaterial] = useState<Material>('aluminum')
  const [volumeMl, setVolumeMl] = useState(355)
  const [customVol, setCustomVol] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [name, setName] = useState('')
  const [added, setAdded] = useState(false)

  const refundCents = calculateRefundCents(material, volumeMl)
  const total = refundCents * quantity

  const handleAdd = async () => {
    await db.items.add({
      name: name.trim() || undefined,
      material,
      volumeMl,
      quantity,
      refundCents,
      scannedAt: new Date().toISOString(),
      sessionKey
    })
    setAdded(true)
    onItemAdded()
    setTimeout(() => {
      setAdded(false)
      setQuantity(1)
      setName('')
    }, 1200)
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
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 18, color: '#111827' }}>
        Manual Entry
      </h2>

      {/* Container type */}
      <label style={labelStyle}>Container type</label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 18 }}>
        {MATERIAL_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setMaterial(opt.value)}
            style={{
              padding: '10px 4px', borderRadius: 10,
              border: `2px solid ${material === opt.value ? '#15803d' : '#e5e7eb'}`,
              background: material === opt.value ? '#dcfce7' : '#f9fafb',
              color: material === opt.value ? '#15803d' : '#374151',
              cursor: 'pointer', fontSize: 11,
              fontWeight: material === opt.value ? 700 : 400,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 4
            }}
          >
            <span style={{ fontSize: 22 }}>{opt.icon}</span>
            {opt.label}
          </button>
        ))}
      </div>

      {/* Volume presets */}
      <label style={labelStyle}>Volume (mL)</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {PRESET_VOLUMES.map(v => {
          const active = volumeMl === v && !customVol
          return (
            <button
              key={v}
              onClick={() => handleVolumePreset(v)}
              style={{
                padding: '5px 10px', borderRadius: 8,
                border: `2px solid ${active ? '#15803d' : '#e5e7eb'}`,
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
        style={inputStyle}
        placeholder="Custom mL…"
        min={1}
      />

      {/* Name */}
      <label style={labelStyle}>Label / name (optional)</label>
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        style={inputStyle}
        placeholder="e.g. Coors Light 355 mL"
      />

      {/* Quantity stepper */}
      <label style={labelStyle}>Quantity</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
        <button
          onClick={() => setQuantity(q => Math.max(1, q - 1))}
          style={stepperBtn}
          disabled={quantity <= 1}
        >
          −
        </button>
        <span style={{ fontSize: 28, fontWeight: 800, minWidth: 36, textAlign: 'center' }}>
          {quantity}
        </span>
        <button onClick={() => setQuantity(q => q + 1)} style={stepperBtn}>
          +
        </button>
        {quantity < 24 && (
          <button
            onClick={() => setQuantity(24)}
            style={{
              marginLeft: 4, padding: '6px 10px',
              borderRadius: 8, border: '1.5px solid #e5e7eb',
              background: '#f9fafb', color: '#6b7280',
              fontSize: 12, cursor: 'pointer'
            }}
          >
            Case (24)
          </button>
        )}
      </div>

      {/* Refund summary */}
      <div style={{
        background: '#f0fdf4', borderRadius: 12,
        padding: '14px 16px', marginBottom: 20,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>
            {refundRuleLabel(material)}
          </div>
          <div style={{ fontSize: 14, color: '#374151' }}>
            Per item: <strong style={{ color: '#15803d' }}>{formatCents(refundCents)}</strong>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>Total</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#15803d' }}>
            {formatCents(total)}
          </div>
        </div>
      </div>

      <button
        onClick={handleAdd}
        disabled={added}
        style={{
          width: '100%', padding: '15px',
          borderRadius: 12, border: 'none',
          background: added ? '#16a34a' : '#15803d',
          color: '#fff', fontSize: 16,
          fontWeight: 700, cursor: added ? 'default' : 'pointer',
          transition: 'background 0.15s',
          boxShadow: '0 2px 8px rgba(21,128,61,0.25)'
        }}
      >
        {added ? '✓ Added!' : `Add ${quantity > 1 ? `${quantity} × ` : ''}Container`}
      </button>

      {/* Padding for scroll clearance above bottom nav */}
      <div style={{ height: 24 }} />
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600,
  color: '#374151', marginBottom: 7
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  borderRadius: 8, border: '1.5px solid #e5e7eb',
  fontSize: 15, marginBottom: 16,
  outline: 'none', background: '#f9fafb',
  WebkitAppearance: 'none'
}
const stepperBtn: React.CSSProperties = {
  width: 44, height: 44, borderRadius: 22,
  border: '2px solid #e5e7eb',
  background: '#fff', color: '#374151',
  fontSize: 22, fontWeight: 700,
  cursor: 'pointer', lineHeight: 1,
  display: 'flex', alignItems: 'center', justifyContent: 'center'
}
