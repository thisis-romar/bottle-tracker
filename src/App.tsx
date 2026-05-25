import { useState, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { useSession } from './hooks/useSession'
import { useProductDb } from './hooks/useProductDb'
import { useSettings } from './hooks/useSettings'
import { useGoogleAuth } from './hooks/useGoogleAuth'
import BottomNav from './components/BottomNav'
import SettingsSheet from './components/SettingsSheet'
import ScanScreen from './screens/ScanScreen'
import ManualEntryScreen from './screens/ManualEntryScreen'
import CurrentBagScreen from './screens/CurrentBagScreen'
import HistoryScreen from './screens/HistoryScreen'

export type Tab = 'scan' | 'manual' | 'bag' | 'history'

export default function App() {
  const [tab, setTab] = useState<Tab>('scan')
  const [showSettings, setShowSettings] = useState(false)

  const { sessionKey, finishSession, clearSession } = useSession()
  const { settings, update: updateSettings } = useSettings()
  const auth = useGoogleAuth()

  useProductDb()

  const bagItems = useLiveQuery(
    () => db.items.where('sessionKey').equals(sessionKey).toArray(),
    [sessionKey]
  ) ?? []
  const bagCount = bagItems.reduce((s, i) => s + i.quantity, 0)

  const handleFinishSession = useCallback(async (note?: string) => {
    await finishSession(note)
    setTab('history')
  }, [finishSession])

  const handleClearAllData = useCallback(async () => {
    await db.items.clear()
    await db.sessions.clear()
    await db.barcodes.clear()
    localStorage.clear()
    sessionStorage.clear()
    window.location.reload()
  }, [])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* App header */}
      <header style={{
        background: '#15803d', color: '#fff',
        padding: '0 16px',
        paddingTop: 'calc(10px + env(safe-area-inset-top, 0px))',
        paddingBottom: 10,
        display: 'flex', alignItems: 'center', gap: 10,
        flexShrink: 0,
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
      }}>
        <span style={{ fontSize: 20 }}>♻️</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 16, lineHeight: 1.2 }}>
            Ontario Bottle Tracker
          </div>
          <div style={{ fontSize: 11, opacity: 0.75 }}>ODRP deposit calculator</div>
        </div>

        {/* Sheets indicator */}
        {auth.connected && (
          <div style={{
            fontSize: 10, fontWeight: 700, color: '#86efac',
            background: 'rgba(255,255,255,0.15)',
            padding: '3px 8px', borderRadius: 10
          }}>
            📊 Sheets
          </div>
        )}

        {/* Settings gear */}
        <button
          onClick={() => setShowSettings(true)}
          style={{
            background: 'rgba(255,255,255,0.15)', border: 'none',
            color: '#fff', borderRadius: 8, width: 34, height: 34,
            cursor: 'pointer', fontSize: 16, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            flexShrink: 0
          }}
          aria-label="Settings"
        >
          ⚙️
        </button>
      </header>

      {/* Screen content */}
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {tab === 'scan' && (
          <ScanScreen
            sessionKey={sessionKey}
            onItemAdded={() => {}}
            soundEnabled={settings.soundEnabled}
            vibrateEnabled={settings.vibrateEnabled}
            aiDetailsEnabled={settings.aiDetailsEnabled}
          />
        )}
        {tab === 'manual' && (
          <ManualEntryScreen sessionKey={sessionKey} onItemAdded={() => {}} />
        )}
        {tab === 'bag' && (
          <CurrentBagScreen
            sessionKey={sessionKey}
            onFinishSession={handleFinishSession}
            onClearSession={clearSession}
            sheetsConnected={auth.connected}
          />
        )}
        {tab === 'history' && (
          <HistoryScreen sheetsConnected={auth.connected} />
        )}
      </main>

      <BottomNav tab={tab} onTabChange={setTab} bagCount={bagCount} />

      {/* Settings sheet */}
      {showSettings && (
        <SettingsSheet
          settings={settings}
          onSettingsUpdate={updateSettings}
          auth={auth}
          onClearAllData={handleClearAllData}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
