import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { ContainerItem } from '../db'
import { formatCents } from '../utils/refund'
import { itemsToCSV, downloadCSV } from '../utils/export'
import { exportSession } from '../utils/googleSheets'

interface Props {
  sessionKey: string
  onFinishSession: (note?: string) => Promise<void>
  onClearSession: () => Promise<void>
  sheetsConnected: boolean
}

const MATERIAL_ICON: Record<string, string> = {
  aluminum: '🥤',
  glass:    '🍾',
  plastic:  '🧴',
  tetra:    '🧃',
  unknown:  '📦'
}

export default function CurrentBagScreen({ sessionKey, onFinishSession, onClearSession, sheetsConnected }: Props) {
  const [saving, setSaving] = useState(false)
  const [sheetsExporting, setSheetsExporting] = useState(false)
  const [sheetsToast, setSheetsToast] = useState<{ url: string } | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [finishNote, setFinishNote] = useState('')
  const [showNoteDialog, setShowNoteDialog] = useState(false)

  const items = useLiveQuery(
    () => db.items.where('sessionKey').equals(sessionKey).toArray(),
    [sessionKey]
  ) ?? []

  const totalQty   = items.reduce((s, i) => s + i.quantity, 0)
  const totalCents = items.reduce((s, i) => s + i.refundCents * i.quantity, 0)
  const canCount   = items.filter(i => i.material === 'aluminum').reduce((s,i) => s + i.quantity, 0)
  const bottleCount = totalQty - canCount

  const handleIncrement = async (item: ContainerItem) => {
    if (item.id == null) return
    await db.items.update(item.id, { quantity: item.quantity + 1 })
  }

  const handleDecrement = async (item: ContainerItem) => {
    if (item.id == null) return
    if (item.quantity <= 1) {
      await db.items.delete(item.id)
    } else {
      await db.items.update(item.id, { quantity: item.quantity - 1 })
    }
  }

  const handleDelete = async (item: ContainerItem) => {
    if (item.id == null) return
    await db.items.delete(item.id)
  }

  const handleExport = () => {
    const csv = itemsToCSV(items)
    const date = new Date().toLocaleDateString('en-CA').replace(/\//g, '-')
    downloadCSV(csv, `bottles-${date}.csv`)
  }

  const handleExportSheets = async () => {
    if (!sheetsConnected) return
    setSheetsExporting(true)
    try {
      const result = await exportSession(items)
      setSheetsToast({ url: result.spreadsheetUrl })
      setTimeout(() => setSheetsToast(null), 6000)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Sheets export failed')
    } finally {
      setSheetsExporting(false)
    }
  }

  const handleSaveReturn = async () => {
    setSaving(true)
    await onFinishSession(finishNote.trim() || undefined)
    setFinishNote('')
    setShowNoteDialog(false)
    setSaving(false)
  }

  const handleClear = async () => {
    await onClearSession()
    setConfirmClear(false)
  }

  if (items.length === 0) {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: 40, color: '#9ca3af', textAlign: 'center'
      }}>
        <div style={{ fontSize: 64, marginBottom: 14 }}>🛍️</div>
        <div style={{ fontSize: 17, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
          Bag is empty
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.5 }}>
          Scan barcodes or use Manual Entry to add containers.
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Total header */}
      <div style={{
        background: '#15803d', color: '#fff',
        padding: '14px 20px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexShrink: 0
      }}>
        <div>
          <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            Estimated Refund
          </div>
          <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.1 }}>
            {formatCents(totalCents)}
          </div>
        </div>
        <div style={{ textAlign: 'right', display: 'flex', gap: 20 }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.75 }}>Cans</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{canCount}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, opacity: 0.75 }}>Bottles</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{bottleCount}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, opacity: 0.75 }}>Total</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{totalQty}</div>
          </div>
        </div>
      </div>

      {/* Item list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {items.map(item => (
          <ItemRow
            key={item.id}
            item={item}
            onIncrement={() => handleIncrement(item)}
            onDecrement={() => handleDecrement(item)}
            onDelete={() => handleDelete(item)}
          />
        ))}
        <div style={{ height: 8 }} />
      </div>

      {/* Sheets success toast */}
      {sheetsToast && (
        <div style={{
          background: '#166534', color: '#fff',
          padding: '10px 16px', fontSize: 13, fontWeight: 600,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <span>✓ Exported to Google Sheets</span>
          <a href={sheetsToast.url} target="_blank" rel="noopener noreferrer"
            style={{ color: '#86efac', fontSize: 12, textDecoration: 'underline' }}>
            Open ↗
          </a>
        </div>
      )}

      {/* Action bar */}
      <div style={{
        padding: '10px 12px',
        borderTop: '1px solid #e5e7eb',
        display: 'flex', gap: 8, flexShrink: 0,
        paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))'
      }}>
        <button onClick={handleExport} style={secondaryBtnStyle}>
          📤 CSV
        </button>
        {sheetsConnected && (
          <button onClick={handleExportSheets} disabled={sheetsExporting} style={secondaryBtnStyle}>
            {sheetsExporting ? '…' : '📊'}
          </button>
        )}
        <button
          onClick={() => setConfirmClear(true)}
          style={{ ...secondaryBtnStyle, color: '#dc2626', borderColor: '#fee2e2' }}
        >
          🗑 Clear
        </button>
        <button
          onClick={() => setShowNoteDialog(true)}
          disabled={saving}
          style={primaryBtnStyle}
        >
          {saving ? 'Saving…' : '✓ Save Return'}
        </button>
      </div>

      {/* Save note dialog */}
      {showNoteDialog && (
        <Overlay>
          <div className="slide-up" style={dialogStyle}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Save Return</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 14 }}>
              {totalQty} items · {formatCents(totalCents)} refund
            </div>
            <input
              value={finishNote}
              onChange={e => setFinishNote(e.target.value)}
              placeholder="Optional note (e.g. 'The Beer Store — King St')"
              style={{ ...sheetInputStyle, marginBottom: 14 }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowNoteDialog(false)} style={cancelBtnStyle}>Cancel</button>
              <button onClick={handleSaveReturn} style={confirmBtnStyle}>Save</button>
            </div>
          </div>
        </Overlay>
      )}

      {/* Confirm clear dialog */}
      {confirmClear && (
        <Overlay>
          <div className="slide-up" style={dialogStyle}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Clear Bag?</div>
            <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 18, lineHeight: 1.5 }}>
              This will delete all {totalQty} items from the current bag without saving. This can't be undone.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmClear(false)} style={cancelBtnStyle}>Cancel</button>
              <button
                onClick={handleClear}
                style={{ ...confirmBtnStyle, background: '#dc2626' }}
              >
                Clear
              </button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  )
}

function ItemRow({ item, onIncrement, onDecrement, onDelete }: {
  item: ContainerItem
  onIncrement: () => void
  onDecrement: () => void
  onDelete: () => void
}) {
  const icon = MATERIAL_ICON[item.material] ?? '📦'
  const label = item.name ?? `${item.material.charAt(0).toUpperCase() + item.material.slice(1)} ${item.volumeMl} mL`
  const subtotal = item.refundCents * item.quantity

  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      padding: '10px 14px',
      borderBottom: '1px solid #f3f4f6',
      gap: 10
    }}>
      <div style={{ fontSize: 26, flexShrink: 0 }}>{icon}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: 600, fontSize: 14,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
        }}>
          {label}
        </div>
        <div style={{ fontSize: 12, color: '#6b7280' }}>
          {item.volumeMl} mL · {formatCents(item.refundCents)}/ea
          {item.barcode && <span style={{ color: '#d1d5db' }}> · {item.barcode}</span>}
        </div>
      </div>

      {/* Qty controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <button onClick={onDecrement} style={qtyBtn}>−</button>
        <span style={{ fontSize: 16, fontWeight: 700, minWidth: 20, textAlign: 'center' }}>
          {item.quantity}
        </span>
        <button onClick={onIncrement} style={qtyBtn}>+</button>
      </div>

      <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 52 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: '#15803d' }}>
          {formatCents(subtotal)}
        </div>
        <button
          onClick={onDelete}
          style={{
            fontSize: 11, color: '#dc2626',
            background: 'none', border: 'none',
            cursor: 'pointer', padding: '2px 0'
          }}
        >
          Remove
        </button>
      </div>
    </div>
  )
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 50,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'flex-end'
    }}>
      {children}
    </div>
  )
}

const dialogStyle: React.CSSProperties = {
  background: '#fff', width: '100%',
  borderRadius: '20px 20px 0 0',
  padding: '24px 20px',
  paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))'
}
const sheetInputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  borderRadius: 8, border: '1.5px solid #e5e7eb',
  fontSize: 15, outline: 'none', background: '#f9fafb'
}
const primaryBtnStyle: React.CSSProperties = {
  flex: 2, padding: '12px',
  borderRadius: 10, border: 'none',
  background: '#15803d', color: '#fff',
  fontSize: 14, fontWeight: 700, cursor: 'pointer'
}
const secondaryBtnStyle: React.CSSProperties = {
  flex: 1, padding: '12px',
  borderRadius: 10, border: '1.5px solid #e5e7eb',
  background: '#fff', color: '#374151',
  fontSize: 14, fontWeight: 600, cursor: 'pointer'
}
const cancelBtnStyle: React.CSSProperties = {
  flex: 1, padding: '12px',
  borderRadius: 10, border: '1.5px solid #e5e7eb',
  background: '#fff', color: '#374151',
  fontSize: 15, fontWeight: 600, cursor: 'pointer'
}
const confirmBtnStyle: React.CSSProperties = {
  flex: 2, padding: '12px',
  borderRadius: 10, border: 'none',
  background: '#15803d', color: '#fff',
  fontSize: 15, fontWeight: 700, cursor: 'pointer'
}
const qtyBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 15,
  border: '1.5px solid #e5e7eb',
  background: '#f9fafb', color: '#374151',
  fontSize: 17, fontWeight: 700,
  cursor: 'pointer', lineHeight: 1,
  display: 'flex', alignItems: 'center', justifyContent: 'center'
}
