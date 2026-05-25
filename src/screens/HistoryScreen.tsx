import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { Session, BarcodeMapping } from '../db'
import { formatCents } from '../utils/refund'
import { itemsToCSV, downloadCSV } from '../utils/export'
import { exportSession } from '../utils/googleSheets'
import { calculateRefundCents } from '../utils/refund'
import type { Material } from '../db'

export default function HistoryScreen({ sheetsConnected = false }: { sheetsConnected?: boolean }) {
  const sessions = useLiveQuery(
    () => db.sessions.orderBy('finishedAt').reverse().toArray()
  ) ?? []

  const barcodes = useLiveQuery(() => db.barcodes.toArray()) ?? []

  const allTimeCents = sessions.reduce((s, sess) => s + sess.totalRefundCents, 0)
  const allTimeItems = sessions.reduce((s, sess) => s + sess.totalItems, 0)

  // ─── Barcode DB export ─────────────────────────────────────────────────

  const handleExportBarcodes = () => {
    const header = 'barcode,name,material,volumeMl,refundCents,updatedAt'
    const rows = barcodes.map(b =>
      [b.barcode, b.name ?? '', b.material, b.volumeMl, b.refundCents, b.updatedAt].join(',')
    )
    const csv = [header, ...rows].join('\n')
    downloadCSV(csv, `barcode-db-${new Date().toLocaleDateString('en-CA').replace(/\//g,'-')}.csv`)
  }

  // ─── Barcode DB import ─────────────────────────────────────────────────

  const handleImportBarcodes = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length < 2) return

    const headers = lines[0].split(',')
    const idx = (name: string) => headers.indexOf(name)

    const entries: BarcodeMapping[] = []
    for (const line of lines.slice(1)) {
      const cols = line.split(',')
      const barcode = cols[idx('barcode')]?.trim()
      const material = cols[idx('material')]?.trim() as Material
      const volumeMl = parseInt(cols[idx('volumeMl')]?.trim() ?? '', 10)
      if (!barcode || !material || isNaN(volumeMl)) continue

      entries.push({
        barcode,
        name: cols[idx('name')]?.trim() || undefined,
        material,
        volumeMl,
        refundCents: (parseInt(cols[idx('refundCents')]?.trim() ?? '', 10) || calculateRefundCents(material, volumeMl)) as 10 | 20,
        updatedAt: cols[idx('updatedAt')]?.trim() || new Date().toISOString()
      })
    }

    if (entries.length === 0) return
    await db.barcodes.bulkPut(entries)
    alert(`Imported ${entries.length} barcode mapping${entries.length !== 1 ? 's' : ''}.`)
    e.target.value = ''
  }

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>

      {/* All-time summary */}
      {sessions.length > 0 && (
        <div style={{
          margin: '12px 12px 8px',
          background: '#f0fdf4', borderRadius: 12,
          padding: '14px 18px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div>
            <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              All-time total
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#15803d' }}>
              {formatCents(allTimeCents)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#6b7280' }}>Returns</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#374151' }}>{sessions.length}</div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>{allTimeItems} items</div>
          </div>
        </div>
      )}

      {/* Barcode DB export / import */}
      <div style={{ margin: '0 12px 10px', display: 'flex', gap: 8 }}>
        <button onClick={handleExportBarcodes} style={barcodeBtnStyle}>
          🗂 Export Barcodes ({barcodes.length})
        </button>
        <label style={{ ...barcodeBtnStyle, cursor: 'pointer', textAlign: 'center' }}>
          📥 Import CSV
          <input
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            onChange={handleImportBarcodes}
          />
        </label>
      </div>

      {/* Sessions */}
      {sessions.length === 0 ? (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: 40, color: '#9ca3af', textAlign: 'center'
        }}>
          <div style={{ fontSize: 64, marginBottom: 14 }}>📋</div>
          <div style={{ fontSize: 17, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
            No returns yet
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.5 }}>
            Save a bag from the Bag tab to record a return.
          </div>
        </div>
      ) : (
        <>
          <div style={{ padding: '0 12px 4px', fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Return Sessions
          </div>
          {sessions.map(s => <SessionCard key={s.id} session={s} sheetsConnected={sheetsConnected} />)}
          <div style={{ height: 16 }} />
        </>
      )}
    </div>
  )
}

function SessionCard({ session, sheetsConnected }: { session: Session; sheetsConnected: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [sheetsExporting, setSheetsExporting] = useState(false)
  const [sheetsUrl, setSheetsUrl] = useState<string | null>(null)

  const finishedDate = new Date(session.finishedAt ?? session.startedAt)

  const handleExport = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setExporting(true)
    const items = await db.items.where('sessionKey').equals(session.sessionKey).toArray()
    if (items.length > 0) {
      const csv = itemsToCSV(items, session)
      const dateStr = finishedDate.toLocaleDateString('en-CA').replace(/\//g, '-')
      downloadCSV(csv, `bottle-return-${dateStr}.csv`)
    }
    setExporting(false)
  }

  const handleExportSheets = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!sheetsConnected) return
    setSheetsExporting(true)
    try {
      const items = await db.items.where('sessionKey').equals(session.sessionKey).toArray()
      const result = await exportSession(items, session)
      setSheetsUrl(result.spreadsheetUrl)
      setTimeout(() => setSheetsUrl(null), 6000)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Sheets export failed')
    } finally {
      setSheetsExporting(false)
    }
  }

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Delete this return record and all its items?')) return
    if (session.id != null) {
      await db.items.where('sessionKey').equals(session.sessionKey).delete()
      await db.sessions.delete(session.id)
    }
  }

  return (
    <div
      onClick={() => setExpanded(x => !x)}
      style={{
        margin: '0 12px 8px', background: '#fff',
        borderRadius: 12, border: '1px solid #e5e7eb',
        overflow: 'hidden', cursor: 'pointer'
      }}
    >
      <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 20, color: '#15803d', lineHeight: 1 }}>
            {formatCents(session.totalRefundCents)}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>
            {session.totalItems} item{session.totalItems !== 1 ? 's' : ''}
            {session.note && <span> · {session.note}</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>
            {finishedDate.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
          <div style={{ fontSize: 12, color: '#9ca3af' }}>
            {finishedDate.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid #f3f4f6', padding: '10px 16px' }}>
          <SessionItemList sessionKey={session.sessionKey} />
        </div>
      )}

      <div style={{ borderTop: '1px solid #f3f4f6', padding: '8px 12px', display: 'flex', gap: 8, background: '#fafafa' }}>
        <button onClick={handleExport} style={actionBtnStyle} disabled={exporting}>
          {exporting ? '…' : '📤 CSV'}
        </button>
        {sheetsConnected && (
          <button onClick={handleExportSheets} style={actionBtnStyle} disabled={sheetsExporting}>
            {sheetsExporting ? '…' : '📊 Sheets'}
          </button>
        )}
        {sheetsUrl && (
          <a href={sheetsUrl} target="_blank" rel="noopener noreferrer"
            style={{ ...actionBtnStyle, color: '#15803d', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
            ✓ Open ↗
          </a>
        )}
        <button onClick={handleDelete} style={{ ...actionBtnStyle, color: '#dc2626', borderColor: '#fee2e2' }}>
          🗑 Delete
        </button>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#9ca3af' }}>
            {expanded ? '▲ Hide' : '▼ Details'}
          </span>
        </div>
      </div>
    </div>
  )
}

function SessionItemList({ sessionKey }: { sessionKey: string }) {
  const items = useLiveQuery(
    () => db.items.where('sessionKey').equals(sessionKey).toArray(),
    [sessionKey]
  ) ?? []

  if (items.length === 0) {
    return <div style={{ fontSize: 13, color: '#9ca3af', padding: '4px 0' }}>No items found.</div>
  }

  return (
    <div>
      {items.map(item => {
        const icon = { aluminum:'🥤', glass:'🍾', plastic:'🧴', tetra:'🧃', unknown:'📦' }[item.material] ?? '📦'
        const label = item.name ?? `${item.material} ${item.volumeMl} mL`
        return (
          <div key={item.id} style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: 13, padding: '4px 0',
            borderBottom: '1px solid #f9fafb'
          }}>
            <span>{icon} {label} ×{item.quantity}</span>
            <span style={{ color: '#15803d', fontWeight: 600 }}>
              {formatCents(item.refundCents * item.quantity)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

const barcodeBtnStyle: React.CSSProperties = {
  flex: 1, fontSize: 12, padding: '8px 10px',
  borderRadius: 8, border: '1.5px solid #e5e7eb',
  background: '#f9fafb', cursor: 'pointer',
  color: '#374151', fontWeight: 600
}
const actionBtnStyle: React.CSSProperties = {
  fontSize: 12, padding: '5px 10px',
  borderRadius: 8, border: '1.5px solid #e5e7eb',
  background: '#fff', cursor: 'pointer',
  color: '#374151', fontWeight: 600
}
