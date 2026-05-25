import { useState, useEffect } from 'react'
import { buildContributeUrl } from '../utils/productDb'
import type { Material } from '../db'

interface Props {
  barcode: string
  name: string
  material: Material
  volumeMl: number
  refundCents: 10 | 20
  onDismiss: () => void
}

const AUTO_DISMISS_MS = 8000

export default function ContributePrompt({
  barcode, name, material, volumeMl, refundCents, onDismiss
}: Props) {
  const [visible, setVisible] = useState(true)
  const contributeUrl = buildContributeUrl({ barcode, name, material, volumeMl })

  useEffect(() => {
    const t = setTimeout(() => { setVisible(false); onDismiss() }, AUTO_DISMISS_MS)
    return () => clearTimeout(t)
  }, [onDismiss])

  if (!visible) return null

  const dismiss = () => { setVisible(false); onDismiss() }

  return (
    <div className="slide-up" style={{
      position: 'absolute', bottom: 20, left: 12, right: 12, zIndex: 90,
      background: '#1e293b', borderRadius: 14,
      padding: '14px 16px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
    }}>
      {/* Dismiss */}
      <button
        onClick={dismiss}
        style={{
          position: 'absolute', top: 8, right: 10,
          background: 'none', border: 'none', color: '#64748b',
          fontSize: 18, cursor: 'pointer', lineHeight: 1
        }}
      >
        ×
      </button>

      {/* Saved confirmation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 20 }}>✅</span>
        <div>
          <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>
            {name || `${material} ${volumeMl} mL`}
          </div>
          <div style={{ color: '#94a3b8', fontSize: 12 }}>
            Saved locally · {refundCents === 10 ? '$0.10' : '$0.20'} refund
          </div>
        </div>
      </div>

      {/* Contribute CTA — only shown when VITE_CONTRIBUTE_URL is set */}
      {contributeUrl ? (
        <>
          <div style={{
            borderTop: '1px solid #334155',
            marginBottom: 10, paddingTop: 10,
            color: '#94a3b8', fontSize: 12, lineHeight: 1.5
          }}>
            Help others — contribute this barcode to the community database so everyone's app auto-fills it instantly.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={dismiss} style={skipStyle}>Not now</button>
            <a
              href={contributeUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={dismiss}
              style={contributeStyle}
            >
              🌐 Contribute →
            </a>
          </div>
        </>
      ) : (
        <div style={{ color: '#64748b', fontSize: 11 }}>
          Set VITE_CONTRIBUTE_URL to enable community contributions.
        </div>
      )}
    </div>
  )
}

const skipStyle: React.CSSProperties = {
  flex: 1, padding: '9px',
  borderRadius: 8, border: '1px solid #334155',
  background: 'none', color: '#94a3b8',
  fontSize: 13, fontWeight: 600, cursor: 'pointer'
}
const contributeStyle: React.CSSProperties = {
  flex: 2, padding: '9px',
  borderRadius: 8, border: 'none',
  background: '#15803d', color: '#fff',
  fontSize: 13, fontWeight: 700, cursor: 'pointer',
  textDecoration: 'none', textAlign: 'center',
  display: 'block'
}
