import type { Tab } from '../App'

interface Props {
  tab: Tab
  onTabChange: (t: Tab) => void
  bagCount: number
}

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'scan',    label: 'Scan',    icon: '📷' },
  { id: 'manual',  label: 'Manual',  icon: '✏️' },
  { id: 'bag',     label: 'Bag',     icon: '🛍️' },
  { id: 'history', label: 'History', icon: '📋' },
]

export default function BottomNav({ tab, onTabChange, bagCount }: Props) {
  return (
    <nav style={{
      display: 'flex',
      borderTop: '1px solid #e5e7eb',
      background: '#fff',
      paddingBottom: 'env(safe-area-inset-bottom)',
      flexShrink: 0
    }}>
      {TABS.map(t => {
        const active = tab === t.id
        return (
          <button
            key={t.id}
            onClick={() => onTabChange(t.id)}
            style={{
              flex: 1,
              padding: '8px 0 10px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              position: 'relative',
              color: active ? '#15803d' : '#9ca3af',
              transition: 'color 0.15s'
            }}
          >
            <div style={{ fontSize: 22, lineHeight: 1.2 }}>{t.icon}</div>
            <div style={{
              fontSize: 10, marginTop: 2,
              fontWeight: active ? 700 : 400,
              letterSpacing: active ? 0 : 0.2
            }}>
              {t.label}
            </div>
            {/* Bag badge */}
            {t.id === 'bag' && bagCount > 0 && (
              <span style={{
                position: 'absolute', top: 4,
                left: '50%', transform: 'translateX(6px)',
                background: '#dc2626', color: '#fff',
                borderRadius: 10, minWidth: 18, height: 18,
                fontSize: 11, fontWeight: 700,
                display: 'inline-flex', alignItems: 'center',
                justifyContent: 'center', padding: '0 4px',
                lineHeight: 1
              }}>
                {bagCount > 99 ? '99+' : bagCount}
              </span>
            )}
            {/* Active indicator */}
            {active && (
              <div style={{
                position: 'absolute', bottom: 0, left: '50%',
                transform: 'translateX(-50%)',
                width: 24, height: 3,
                background: '#15803d', borderRadius: 2
              }} />
            )}
          </button>
        )
      })}
    </nav>
  )
}
