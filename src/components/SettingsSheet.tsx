import { useState } from 'react'
import type { AppSettings, VisionMode } from '../hooks/useSettings'
import type { GoogleAuthState } from '../hooks/useGoogleAuth'
import { extractWithVision } from '../utils/productSources'

/** A small synthetic label image so "Test extraction" exercises the real call without a camera. */
async function makeTestImage(): Promise<Blob> {
  const c = document.createElement('canvas')
  c.width = 480; c.height = 270
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('canvas unavailable')
  ctx.fillStyle = '#e8e2d0'; ctx.fillRect(0, 0, c.width, c.height)
  ctx.fillStyle = '#1a1a1a'
  ctx.font = 'bold 30px sans-serif'; ctx.fillText('Stella Artois', 24, 90)
  ctx.font = '22px sans-serif'
  ctx.fillText('355 mL · 5.0% alc/vol', 24, 140)
  ctx.fillText('Beer · Aluminum can', 24, 178)
  return new Promise((resolve, reject) =>
    c.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.85))
}

const VISION_MODES: { id: VisionMode; label: string }[] = [
  { id: 'mock',  label: 'Mock' },
  { id: 'byok',  label: 'My key' },
  { id: 'proxy', label: 'Proxy' },
]

interface Props {
  settings: AppSettings
  onSettingsUpdate: (patch: Partial<AppSettings>) => void
  auth: GoogleAuthState & {
    connect: () => void
    disconnect: () => void
  }
  onClearAllData: () => void
  onClose: () => void
}

export default function SettingsSheet({
  settings, onSettingsUpdate, auth, onClearAllData, onClose
}: Props) {
  const [confirmClear, setConfirmClear] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

  const clientIdSet = !!import.meta.env.VITE_GOOGLE_CLIENT_ID

  async function runVisionTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const image = await makeTestImage()
      const res = await extractWithVision(image, {
        mode: settings.visionMode,
        apiKey: settings.anthropicApiKey,
        proxyUrl: settings.visionProxyUrl,
      })
      const head = res.ok ? '✓ Success' : `✗ ${res.note ?? 'failed'}`
      setTestResult(`${head}\n${JSON.stringify(res.facts, null, 2)}`)
    } catch (e) {
      setTestResult(`✗ ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'flex-end'
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="slide-up" style={{
        background: '#fff', width: '100%',
        borderRadius: '20px 20px 0 0',
        padding: '20px 0',
        paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
        maxHeight: '85vh', overflowY: 'auto'
      }}>
        {/* Handle + header */}
        <div style={{ width: 40, height: 4, borderRadius: 2, background: '#e5e7eb', margin: '0 auto 16px' }} />
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '0 20px', marginBottom: 20
        }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Settings</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#9ca3af' }}>×</button>
        </div>

        {/* ── Scanner section ──────────────────────────── */}
        <SectionHeader>Scanner</SectionHeader>

        <ToggleRow
          label="Sound on scan"
          detail="Short beep when a barcode is read"
          icon="🔊"
          value={settings.soundEnabled}
          onChange={v => onSettingsUpdate({ soundEnabled: v })}
        />
        <ToggleRow
          label="Vibrate on scan"
          detail="Haptic feedback when a barcode is read"
          icon="📳"
          value={settings.vibrateEnabled}
          onChange={v => onSettingsUpdate({ vibrateEnabled: v })}
        />
        {/* ── Can detail extraction ─────────────────────── */}
        <SectionHeader>Can detail extraction</SectionHeader>

        <ToggleRow
          label="Cross-check can details"
          detail="On unknown barcodes, read the can photo and validate size/type/nutrition across sources"
          icon="📷"
          value={settings.aiDetailsEnabled}
          onChange={v => onSettingsUpdate({ aiDetailsEnabled: v })}
        />

        {settings.aiDetailsEnabled && (
          <div style={{ padding: '0 20px 14px' }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {VISION_MODES.map(({ id, label }) => {
                const active = settings.visionMode === id
                return (
                  <button
                    key={id}
                    onClick={() => onSettingsUpdate({ visionMode: id })}
                    style={{
                      flex: 1, padding: '8px 4px', borderRadius: 8,
                      border: `1.5px solid ${active ? '#15803d' : '#e5e7eb'}`,
                      background: active ? '#dcfce7' : '#fff',
                      color: active ? '#15803d' : '#374151',
                      fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer'
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>

            {settings.visionMode === 'byok' && (
              <>
                <input
                  type="password" autoComplete="off" placeholder="Anthropic API key (sk-ant-…)"
                  value={settings.anthropicApiKey}
                  onChange={e => onSettingsUpdate({ anthropicApiKey: e.target.value })}
                  style={settingInput}
                />
                <div style={hintText}>Stored only in this browser. Calls Anthropic directly with prompt caching.</div>
              </>
            )}
            {settings.visionMode === 'proxy' && (
              <>
                <input
                  type="url" autoComplete="off" placeholder="https://your-worker.workers.dev"
                  value={settings.visionProxyUrl}
                  onChange={e => onSettingsUpdate({ visionProxyUrl: e.target.value })}
                  style={settingInput}
                />
                <div style={hintText}>Your serverless proxy holds the key server-side. See <code>worker/README.md</code>.</div>
              </>
            )}
            {settings.visionMode === 'mock' && (
              <div style={hintText}>Simulated extractor — exercises the pipeline without an API key.</div>
            )}

            <button
              onClick={runVisionTest}
              disabled={testing}
              style={{
                marginTop: 12, width: '100%', padding: '10px',
                borderRadius: 8, border: '1.5px solid #e5e7eb',
                background: testing ? '#f3f4f6' : '#fff',
                color: '#15803d', fontSize: 13, fontWeight: 700,
                cursor: testing ? 'default' : 'pointer'
              }}
            >
              {testing ? 'Testing…' : '🧪 Test extraction'}
            </button>
            {testResult && (
              <pre style={{
                marginTop: 8, padding: '10px 12px', borderRadius: 8,
                background: testResult.startsWith('✓') ? '#f0fdf4' : '#fef2f2',
                color: '#374151', fontSize: 11, lineHeight: 1.4,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                border: `1px solid ${testResult.startsWith('✓') ? '#bbf7d0' : '#fecaca'}`
              }}>
                {testResult}
              </pre>
            )}
          </div>
        )}

        {/* ── Google Sheets section ─────────────────────── */}
        <SectionHeader>Google Sheets</SectionHeader>

        {!clientIdSet ? (
          <div style={{ padding: '10px 20px 16px' }}>
            <div style={{
              background: '#fef9c3', borderRadius: 10,
              padding: '12px 14px', fontSize: 13, color: '#713f12', lineHeight: 1.5
            }}>
              <strong>Setup required:</strong> Set <code>VITE_GOOGLE_CLIENT_ID</code> in{' '}
              <code>.env.local</code> to enable Google Sheets export.{' '}
              See <code>.env.example</code> and <code>README.md</code> for instructions.
            </div>
          </div>
        ) : auth.loading ? (
          <div style={{ padding: '16px 20px', color: '#6b7280', fontSize: 14 }}>
            Connecting…
          </div>
        ) : auth.connected ? (
          <div style={{ padding: '0 20px 16px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px', background: '#f0fdf4',
              borderRadius: 10, marginBottom: 12
            }}>
              {auth.tokens?.picture && (
                <img
                  src={auth.tokens.picture}
                  alt=""
                  style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0 }}
                />
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#15803d' }}>
                  {auth.tokens?.name ?? 'Connected'}
                </div>
                <div style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {auth.tokens?.email}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 10 }}>
              Sessions exported to <strong>"Ontario Bottle Tracker"</strong> in your Google Drive.
            </div>
            <button
              onClick={auth.disconnect}
              style={{
                padding: '9px 16px', borderRadius: 8,
                border: '1.5px solid #fee2e2', background: '#fff',
                color: '#dc2626', fontSize: 13, fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Disconnect Google
            </button>
          </div>
        ) : (
          <div style={{ padding: '0 20px 16px' }}>
            {auth.error && (
              <div style={{
                background: '#fee2e2', borderRadius: 8,
                padding: '8px 12px', fontSize: 12, color: '#dc2626',
                marginBottom: 10
              }}>
                {auth.error}
              </div>
            )}
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12, lineHeight: 1.5 }}>
              Connect your Google account to export return sessions directly to a spreadsheet in your Drive.
            </div>
            <button
              onClick={auth.connect}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '11px 16px', borderRadius: 10,
                border: '1.5px solid #e5e7eb', background: '#fff',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
                width: '100%', justifyContent: 'center'
              }}
            >
              <GoogleIcon />
              Sign in with Google
            </button>
          </div>
        )}

        {/* ── Danger zone ──────────────────────────────── */}
        <SectionHeader>Data</SectionHeader>

        <div style={{ padding: '4px 20px 8px' }}>
          {!confirmClear ? (
            <button
              onClick={() => setConfirmClear(true)}
              style={{
                padding: '10px 16px', borderRadius: 8,
                border: '1.5px solid #fee2e2', background: '#fff',
                color: '#dc2626', fontSize: 13, fontWeight: 600, cursor: 'pointer'
              }}
            >
              🗑 Clear all data
            </button>
          ) : (
            <div style={{ background: '#fef2f2', borderRadius: 10, padding: '14px' }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: '#dc2626' }}>
                Delete everything?
              </div>
              <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
                All sessions, items, and learned barcodes will be permanently deleted.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setConfirmClear(false)} style={cancelBtnStyle}>Cancel</button>
                <button onClick={() => { onClearAllData(); setConfirmClear(false); onClose() }} style={deleteBtnStyle}>
                  Delete all
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={{ height: 8 }} />
      </div>
    </div>
  )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '12px 20px 6px',
      fontSize: 11, fontWeight: 700, color: '#9ca3af',
      textTransform: 'uppercase', letterSpacing: 0.6
    }}>
      {children}
    </div>
  )
}

function ToggleRow({ label, detail, icon, value, onChange }: {
  label: string; detail: string; icon: string
  value: boolean; onChange: (v: boolean) => void
}) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '10px 20px', cursor: 'pointer'
      }}
      onClick={() => onChange(!value)}
    >
      <span style={{ fontSize: 22, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>{label}</div>
        <div style={{ fontSize: 12, color: '#9ca3af' }}>{detail}</div>
      </div>
      <Toggle on={value} />
    </div>
  )
}

function Toggle({ on }: { on: boolean }) {
  return (
    <div style={{
      width: 48, height: 28, borderRadius: 14,
      background: on ? '#15803d' : '#e5e7eb',
      position: 'relative', transition: 'background 0.2s',
      flexShrink: 0
    }}>
      <div style={{
        position: 'absolute',
        top: 3, left: on ? 23 : 3,
        width: 22, height: 22, borderRadius: 11,
        background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        transition: 'left 0.2s'
      }} />
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

const settingInput: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1.5px solid #e5e7eb', fontSize: 14, outline: 'none',
  background: '#f9fafb', WebkitAppearance: 'none', boxSizing: 'border-box'
}
const hintText: React.CSSProperties = {
  fontSize: 11, color: '#9ca3af', marginTop: 6, lineHeight: 1.4
}
const cancelBtnStyle: React.CSSProperties = {
  flex: 1, padding: '9px', borderRadius: 8,
  border: '1.5px solid #e5e7eb', background: '#fff',
  color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer'
}
const deleteBtnStyle: React.CSSProperties = {
  flex: 1, padding: '9px', borderRadius: 8,
  border: 'none', background: '#dc2626',
  color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer'
}
