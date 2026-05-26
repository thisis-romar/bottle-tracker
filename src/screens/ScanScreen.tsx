import { useEffect, useRef, useState, useCallback } from 'react'
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser'
import { NotFoundException, BarcodeFormat, DecodeHintType } from '@zxing/library'
import { db } from '../db'
import { calculateRefundCents } from '../utils/refund'
import { lookupBarcode, type OFFResult } from '../utils/offLookup'
import { playBeep, primeAudio } from '../utils/beep'
import UnknownBarcodeModal, { type UnknownBarcodeResult } from '../components/UnknownBarcodeModal'
import ContributePrompt from '../components/ContributePrompt'
import { gatherProductFacts, type ReconciledFacts, type VisionRuntimeConfig } from '../utils/productSources'
import { captureFrameJpeg } from '../utils/captureFrame'
import type { Material } from '../db'

interface Props {
  sessionKey: string
  onItemAdded: () => void
  soundEnabled?: boolean
  vibrateEnabled?: boolean
  aiDetailsEnabled?: boolean
  ocrEnabled?: boolean
  visionConfig?: VisionRuntimeConfig
}

interface Toast {
  id: number
  text: string
  type: 'success' | 'info'
  onUndo?: () => void
}

type LookupState =
  | { phase: 'idle' }
  | { phase: 'looking-up'; barcode: string }
  | { phase: 'show-modal'; barcode: string; offResult: OFFResult | null; reconciled: ReconciledFacts | null; mode: 'add' | 'recheck' }

interface LastAdded {
  barcode: string
  name?: string
  material: Material
  volumeMl: number
}

interface ContributeData {
  barcode: string
  name: string
  material: Material
  volumeMl: number
  refundCents: 10 | 20
}

export default function ScanScreen({ sessionKey, onItemAdded, soundEnabled = true, vibrateEnabled = true, aiDetailsEnabled = false, ocrEnabled = false, visionConfig }: Props) {
  const videoRef    = useRef<HTMLVideoElement>(null)
  const readerRef   = useRef<BrowserMultiFormatReader | null>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const lastScanRef = useRef<{ code: string; time: number } | null>(null)
  const trackRef    = useRef<MediaStreamTrack | null>(null)

  const [scannerStatus, setScannerStatus] = useState<'starting' | 'scanning' | 'error'>('starting')
  const [errorMsg, setErrorMsg] = useState('')
  const [lookup, setLookup] = useState<LookupState>({ phase: 'idle' })
  const [toasts, setToasts] = useState<Toast[]>([])
  const [contributeData, setContributeData] = useState<ContributeData | null>(null)
  const [torchOn, setTorchOn] = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualCode, setManualCode] = useState('')
  const [focusRing, setFocusRing] = useState<{ x: number; y: number } | null>(null)
  const [lastAdded, setLastAdded] = useState<LastAdded | null>(null)

  const addToast = (text: string, type: Toast['type'] = 'success', onUndo?: () => void) => {
    const id = Date.now()
    setToasts(prev => [...prev.slice(-2), { id, text, type, onUndo }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), onUndo ? 5000 : 2200)
  }

  // ─── Core scan handler ───────────────────────────────────────────────────

  const handleScannedCode = useCallback(async (code: string) => {
    const now = Date.now()
    if (lastScanRef.current?.code === code && now - lastScanRef.current.time < 2000) return
    lastScanRef.current = { code, time: now }

    // Don't accept new scans while a lookup/modal is active
    if (lookup.phase !== 'idle') return

    if (soundEnabled) void playBeep()
    if (vibrateEnabled && 'vibrate' in navigator) navigator.vibrate([80])

    // 1. Check local DB first — fastest path, works offline
    const known = await db.barcodes.get(code)
    if (known) {
      await addItemToSession(code, known.name, known.material, known.volumeMl, known.refundCents)
      setLastAdded({ barcode: code, name: known.name, material: known.material, volumeMl: known.volumeMl })
      addToast(`✓ ${known.name ?? `${known.material} ${known.volumeMl}mL`}`)
      onItemAdded()
      return
    }

    // 2. Unknown barcode — start OFF lookup
    setLookup({ phase: 'looking-up', barcode: code })
    addToast('🔍 Looking up…', 'info')

    const offResult = await lookupBarcode(code)

    setToasts([]) // clear the "looking up" toast

    // High-confidence OFF match — auto-add and skip the confirm modal
    if (offResult.confidence === 'full' && offResult.material && offResult.volumeMl && offResult.refundCents) {
      const { material, volumeMl, refundCents } = offResult
      const name = offResult.name ?? offResult.brand
      await db.barcodes.put({
        barcode: code, name, material, volumeMl, refundCents, updatedAt: new Date().toISOString()
      })
      const added = await addItemToSession(code, name, material, volumeMl, refundCents)
      setLastAdded({ barcode: code, name, material, volumeMl })
      onItemAdded()
      addToast(`✓ ${name ?? `${material} ${volumeMl}mL`}`, 'success', () => void undoAutoAdd(code, added))
      setContributeData({
        barcode: code,
        name: name ?? `${material} ${volumeMl} mL`,
        material, volumeMl, refundCents
      })
      setLookup({ phase: 'idle' })
      return
    }

    // Optional cross-check: capture the can photo and validate across sources (AI and/or OCR)
    let reconciled: ReconciledFacts | null = null
    if (aiDetailsEnabled || ocrEnabled) {
      addToast('📷 Checking sources…', 'info')
      const imageJpeg = await captureFrameJpeg(videoRef.current)
      reconciled = await gatherProductFacts({ barcode: code, imageJpeg, aiEnabled: aiDetailsEnabled, ocrEnabled, offResult, visionConfig })
      setToasts([])
    }

    setLookup({ phase: 'show-modal', barcode: code, offResult, reconciled, mode: 'add' })
  }, [lookup, onItemAdded, sessionKey, aiDetailsEnabled, ocrEnabled, visionConfig])  // sessionKey via closure in addItemToSession

  // Manual re-check: re-run the photo cross-check for the last added barcode (opt-in, AI on)
  const handleRecheck = useCallback(async () => {
    if (!lastAdded || lookup.phase !== 'idle') return
    const code = lastAdded.barcode
    addToast('📷 Re-checking…', 'info')
    const imageJpeg = await captureFrameJpeg(videoRef.current)
    const reconciled = await gatherProductFacts({ barcode: code, imageJpeg, aiEnabled: aiDetailsEnabled, ocrEnabled, visionConfig })
    setToasts([])
    setLookup({ phase: 'show-modal', barcode: code, offResult: null, reconciled, mode: 'recheck' })
  }, [lastAdded, lookup, aiDetailsEnabled, ocrEnabled, visionConfig])

  async function addItemToSession(
    barcode: string,
    name: string | undefined,
    material: Parameters<typeof calculateRefundCents>[0],
    volumeMl: number,
    refundCents: 10 | 20
  ): Promise<{ id: number; wasNew: boolean; prevQuantity: number }> {
    const existing = await db.items
      .where('sessionKey').equals(sessionKey)
      .filter(i => i.barcode === barcode)
      .first()

    if (existing?.id != null) {
      await db.items.update(existing.id, { quantity: existing.quantity + 1 })
      return { id: existing.id, wasNew: false, prevQuantity: existing.quantity }
    }
    const id = await db.items.add({
      barcode, name, material, volumeMl, quantity: 1,
      refundCents, scannedAt: new Date().toISOString(), sessionKey
    }) as number
    return { id, wasNew: true, prevQuantity: 0 }
  }

  // Reverts an OFF auto-add: restores the item and removes the just-learned mapping
  const undoAutoAdd = async (
    barcode: string,
    added: { id: number; wasNew: boolean; prevQuantity: number }
  ) => {
    if (added.wasNew) {
      await db.items.delete(added.id)
    } else {
      await db.items.update(added.id, { quantity: added.prevQuantity })
    }
    await db.barcodes.delete(barcode)
    setToasts([])
    setContributeData(null)
    onItemAdded()
  }

  // ─── Modal save handler ─────────────────────────────────────────────────

  const handleSaveUnknown = async (result: UnknownBarcodeResult) => {
    if (lookup.phase !== 'show-modal') return
    const { barcode, mode } = lookup

    // Persist barcode→product mapping so future scans are instant
    await db.barcodes.put({
      barcode,
      name: result.name || undefined,
      material: result.material,
      volumeMl: result.volumeMl,
      refundCents: result.refundCents,
      updatedAt: new Date().toISOString()
    })

    if (mode === 'recheck') {
      // Correct the existing session item in place — do NOT add a new row or bump quantity
      const existing = await db.items
        .where('sessionKey').equals(sessionKey)
        .filter(i => i.barcode === barcode)
        .first()
      if (existing?.id != null) {
        await db.items.update(existing.id, {
          name: result.name || undefined,
          material: result.material,
          volumeMl: result.volumeMl,
          refundCents: result.refundCents
        })
      }
      setLastAdded({ barcode, name: result.name || undefined, material: result.material, volumeMl: result.volumeMl })
      addToast(`✓ Updated ${result.name || `${result.material} ${result.volumeMl}mL`}`)
      setLookup({ phase: 'idle' })
      onItemAdded()
      return
    }

    await addItemToSession(barcode, result.name || undefined, result.material, result.volumeMl, result.refundCents)
    setLastAdded({ barcode, name: result.name || undefined, material: result.material, volumeMl: result.volumeMl })
    addToast(`✓ ${result.name || `${result.material} ${result.volumeMl}mL`}`)
    setLookup({ phase: 'idle' })
    onItemAdded()

    // Show contribute prompt for newly-learned barcodes
    setContributeData({
      barcode,
      name: result.name || `${result.material} ${result.volumeMl} mL`,
      material: result.material,
      volumeMl: result.volumeMl,
      refundCents: result.refundCents
    })
  }

  const handleSkipUnknown = () => setLookup({ phase: 'idle' })

  const toggleTorch = async () => {
    const track = trackRef.current
    if (!track) return
    try {
      const next = !torchOn
      await track.applyConstraints({ advanced: [{ torch: next }] } as unknown as MediaTrackConstraints)
      setTorchOn(next)
    } catch (err) {
      console.warn('[scanner] torch toggle failed', err)
    }
  }

  // Tap-to-focus — best-effort; iOS Safari support is partial, so degrade silently
  const handleTapFocus = async (e: React.MouseEvent<HTMLVideoElement>) => {
    primeAudio()
    const track = trackRef.current
    const rect = e.currentTarget.getBoundingClientRect()
    setFocusRing({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    setTimeout(() => setFocusRing(null), 700)
    if (!track) return
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    const caps = track.getCapabilities?.() as { focusMode?: string[]; pointsOfInterest?: unknown } | undefined
    const modes = caps?.focusMode ?? []
    const advanced: Record<string, unknown>[] = []
    if (caps && 'pointsOfInterest' in caps) advanced.push({ pointsOfInterest: [{ x, y }] })
    if (modes.includes('single-shot')) advanced.push({ focusMode: 'single-shot' })
    else if (modes.includes('manual')) advanced.push({ focusMode: 'manual' })
    if (advanced.length === 0) return
    try {
      await track.applyConstraints({ advanced } as unknown as MediaTrackConstraints)
    } catch {
      /* unsupported — ignore */
    }
  }

  // Manual fallback for codes the camera can't read — reuses the full scan pipeline
  const submitManualCode = async () => {
    const code = manualCode.replace(/\s/g, '')
    if (!/^\d{6,14}$/.test(code)) {
      addToast('Enter the 12–13 digit number under the barcode', 'info')
      return
    }
    setManualOpen(false)
    setManualCode('')
    lastScanRef.current = null // bypass the duplicate-scan debounce for manual entry
    await handleScannedCode(code)
  }

  // Profile a label with OCR (+ AI if on): read size/material/ABV off the can photo and open the
  // confirm sheet pre-filled — for products whose barcode you typed but no database recognises.
  const submitManualWithLabel = async () => {
    const code = manualCode.replace(/\s/g, '')
    if (!/^\d{6,14}$/.test(code)) {
      addToast('Enter the barcode first, then read the label', 'info')
      return
    }
    setManualOpen(false)
    setManualCode('')
    lastScanRef.current = null
    addToast('📷 Reading label…', 'info')
    const imageJpeg = await captureFrameJpeg(videoRef.current)
    const reconciled = await gatherProductFacts({
      barcode: code, imageJpeg, aiEnabled: aiDetailsEnabled, ocrEnabled: true, visionConfig
    })
    setToasts([])
    setLookup({ phase: 'show-modal', barcode: code, offResult: null, reconciled, mode: 'add' })
  }

  // ─── Camera setup ────────────────────────────────────────────────────────

  const startScanner = useCallback(async () => {
    if (!videoRef.current) return

    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMsg('Camera not available. Use Chrome on Android or Safari on iOS (HTTPS required).')
      setScannerStatus('error')
      return
    }

    setScannerStatus('starting')
    setErrorMsg('')

    try {
      // Tune for retail product barcodes: restrict formats + TRY_HARDER markedly
      // improves reads on curved/glary/low-light codes.
      const hints = new Map<DecodeHintType, unknown>()
      hints.set(DecodeHintType.TRY_HARDER, true)
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.UPC_A, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_E, BarcodeFormat.CODE_128
      ])
      const reader = new BrowserMultiFormatReader(hints)
      readerRef.current = reader

      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } },
        videoRef.current,
        (result, err) => {
          if (result) handleScannedCode(result.getText())
          if (err && !(err instanceof NotFoundException)) console.warn('[scanner]', err)
        }
      )
      controlsRef.current = controls
      setScannerStatus('scanning')

      // Detect torch/flashlight support on the active camera track
      const stream = videoRef.current.srcObject as MediaStream | null
      const track = stream?.getVideoTracks?.()[0] ?? null
      trackRef.current = track
      const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean; focusMode?: string[] }) | undefined
      setTorchSupported(!!caps?.torch)
      setTorchOn(false)

      // Best-effort continuous autofocus where supported
      if (track && Array.isArray(caps?.focusMode) && caps.focusMode.includes('continuous')) {
        try {
          await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] } as unknown as MediaTrackConstraints)
        } catch {
          /* ignore */
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setErrorMsg(
        msg.includes('Permission') || msg.includes('NotAllowed')
          ? 'Camera permission denied. Please allow camera access and try again.'
          : msg.includes('NotFound') || msg.includes('Devices')
          ? 'No camera found on this device.'
          : `Camera error: ${msg}`
      )
      setScannerStatus('error')
    }
  }, [handleScannedCode])

  useEffect(() => {
    startScanner()
    return () => {
      controlsRef.current?.stop()
      controlsRef.current = null
      trackRef.current = null
    }
  }, [startScanner])

  // ─── Render ──────────────────────────────────────────────────────────────

  const showModal = lookup.phase === 'show-modal'
  const lookingUp = lookup.phase === 'looking-up'

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#000', position: 'relative', overflow: 'hidden' }}>

      {/* Live video */}
      <video
        ref={videoRef}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        muted playsInline autoPlay
        onClick={handleTapFocus}
      />

      {/* Tap-to-focus ring */}
      {focusRing && (
        <div style={{
          position: 'absolute', left: focusRing.x - 28, top: focusRing.y - 28,
          width: 56, height: 56, borderRadius: '50%',
          border: '2px solid #fde047', boxShadow: '0 0 0 1px rgba(0,0,0,0.3)',
          pointerEvents: 'none', zIndex: 55, animation: 'pulse 0.7s ease-out'
        }} />
      )}

      {/* Scan guide */}
      {scannerStatus === 'scanning' && !lookingUp && (
        <ScanGuide />
      )}

      {/* Torch / flashlight toggle — helps in low light */}
      {scannerStatus === 'scanning' && torchSupported && (
        <button
          onClick={toggleTorch}
          aria-label={torchOn ? 'Turn off flashlight' : 'Turn on flashlight'}
          style={{
            position: 'absolute', top: 14, right: 14,
            width: 46, height: 46, borderRadius: 23,
            border: 'none', cursor: 'pointer',
            background: torchOn ? '#fde047' : 'rgba(0,0,0,0.45)',
            color: torchOn ? '#1f2937' : '#fff',
            fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.35)'
          }}
        >
          🔦
        </button>
      )}

      {/* Manual barcode entry — fallback when the camera can't read the code */}
      {scannerStatus === 'scanning' && !manualOpen && (
        <button
          onClick={() => setManualOpen(true)}
          style={{
            position: 'absolute', top: 14, left: 14,
            height: 46, padding: '0 14px', borderRadius: 23,
            border: 'none', cursor: 'pointer',
            background: 'rgba(0,0,0,0.45)', color: '#fff',
            fontSize: 13, fontWeight: 700, display: 'flex',
            alignItems: 'center', gap: 6,
            boxShadow: '0 2px 8px rgba(0,0,0,0.35)'
          }}
        >
          ⌨️ Enter barcode
        </button>
      )}

      {/* Re-check details — manual cross-check of the last added item (AI and/or OCR on) */}
      {scannerStatus === 'scanning' && !manualOpen && (aiDetailsEnabled || ocrEnabled) && lastAdded && lookup.phase === 'idle' && (
        <button
          onClick={() => void handleRecheck()}
          style={{
            position: 'absolute', top: 70, left: 14,
            height: 40, padding: '0 14px', borderRadius: 20,
            border: 'none', cursor: 'pointer',
            background: 'rgba(0,0,0,0.45)', color: '#fff',
            fontSize: 12, fontWeight: 700, display: 'flex',
            alignItems: 'center', gap: 6,
            boxShadow: '0 2px 8px rgba(0,0,0,0.35)'
          }}
        >
          🔁 Re-check details
        </button>
      )}

      {manualOpen && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 60,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          paddingTop: 'calc(70px + env(safe-area-inset-top, 0px))'
        }}>
          <div style={{
            background: '#fff', borderRadius: 14, padding: 18,
            width: 'min(92%, 360px)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
          }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Enter barcode</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>
              Type the digits printed under the barcode.
            </div>
            <input
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void submitManualCode() }}
              inputMode="numeric"
              autoFocus
              placeholder="e.g. 062067382215"
              style={{
                width: '100%', padding: '11px 12px', borderRadius: 8,
                border: '1.5px solid #e5e7eb', fontSize: 16, outline: 'none',
                background: '#f9fafb', marginBottom: 14, WebkitAppearance: 'none'
              }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => { setManualOpen(false); setManualCode('') }}
                style={{
                  flex: 1, padding: '11px', borderRadius: 10,
                  border: '1.5px solid #e5e7eb', background: '#fff',
                  color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => void submitManualCode()}
                style={{
                  flex: 2, padding: '11px', borderRadius: 10, border: 'none',
                  background: '#15803d', color: '#fff', fontSize: 14, fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Look up ✓
              </button>
            </div>
            {ocrEnabled && (
              <button
                onClick={() => void submitManualWithLabel()}
                style={{
                  width: '100%', marginTop: 10, padding: '11px', borderRadius: 10,
                  border: '1.5px solid #15803d', background: '#f0fdf4', color: '#15803d',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer'
                }}
              >
                📷 Read label instead
              </button>
            )}
          </div>
        </div>
      )}

      {/* Starting */}
      {scannerStatus === 'starting' && (
        <CentredOverlay>
          <div style={{ fontSize: 36, animation: 'pulse 1.2s infinite' }}>📷</div>
          <div style={{ fontSize: 14, color: '#fff', marginTop: 10 }}>Starting camera…</div>
        </CentredOverlay>
      )}

      {/* Looking up overlay — replaces scan guide while request is in flight */}
      {lookingUp && (
        <CentredOverlay>
          <div style={{ fontSize: 32, animation: 'pulse 1s infinite' }}>🔍</div>
          <div style={{ fontSize: 15, color: '#fff', marginTop: 12, fontWeight: 600 }}>
            Looking up barcode…
          </div>
          <div style={{ fontSize: 12, color: '#d1d5db', marginTop: 6 }}>
            Checking Open Food Facts
          </div>
        </CentredOverlay>
      )}

      {/* Error */}
      {scannerStatus === 'error' && (
        <CentredOverlay>
          <div style={{ fontSize: 44 }}>🚫</div>
          <div style={{ fontSize: 15, color: '#fff', textAlign: 'center', marginTop: 12, lineHeight: 1.5, padding: '0 24px' }}>
            {errorMsg}
          </div>
          <button
            onClick={startScanner}
            style={{
              marginTop: 20, padding: '11px 28px',
              borderRadius: 10, background: '#15803d',
              color: '#fff', border: 'none',
              fontSize: 15, fontWeight: 700, cursor: 'pointer'
            }}
          >
            Try Again
          </button>
        </CentredOverlay>
      )}

      {/* Toasts */}
      <div style={{
        position: 'absolute', bottom: 20, left: 0, right: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 8, pointerEvents: 'none'
      }}>
        {toasts.map(t => (
          <div key={t.id} className="scan-toast" style={{
            background: t.type === 'info' ? '#1e293b' : '#15803d',
            color: '#fff', padding: '9px 22px',
            borderRadius: 24, fontSize: 14, fontWeight: 700,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            display: 'flex', alignItems: 'center', gap: 12,
            pointerEvents: t.onUndo ? 'auto' : 'none'
          }}>
            <span>{t.text}</span>
            {t.onUndo && (
              <button
                onClick={t.onUndo}
                style={{
                  background: 'rgba(255,255,255,0.22)', border: 'none', color: '#fff',
                  borderRadius: 14, padding: '4px 12px', fontSize: 13, fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Undo
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Modal */}
      {showModal && lookup.phase === 'show-modal' && (
        <UnknownBarcodeModal
          barcode={lookup.barcode}
          offResult={lookup.offResult}
          reconciled={lookup.reconciled}
          mode={lookup.mode}
          onSave={handleSaveUnknown}
          onSkip={handleSkipUnknown}
        />
      )}

      {/* Contribute prompt — shown after saving a new barcode */}
      {contributeData && (
        <ContributePrompt
          {...contributeData}
          onDismiss={() => setContributeData(null)}
        />
      )}
    </div>
  )
}

function ScanGuide() {
  return (
    <div style={{
      position: 'absolute', inset: 0, pointerEvents: 'none',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{ position: 'relative' }}>
        <div style={{ width: 280, height: 160, borderRadius: 12, boxShadow: '0 0 0 9999px rgba(0,0,0,0.42)' }} />
        {/* Corner marks */}
        {(['tl','tr','bl','br'] as const).map(pos => (
          <div key={pos} style={{
            position: 'absolute', width: 24, height: 24, borderColor: '#4ade80', borderStyle: 'solid', borderWidth: 0,
            ...(pos==='tl' ? {top:0,left:0,borderTopWidth:3,borderLeftWidth:3,borderTopLeftRadius:4}:{}),
            ...(pos==='tr' ? {top:0,right:0,borderTopWidth:3,borderRightWidth:3,borderTopRightRadius:4}:{}),
            ...(pos==='bl' ? {bottom:0,left:0,borderBottomWidth:3,borderLeftWidth:3,borderBottomLeftRadius:4}:{}),
            ...(pos==='br' ? {bottom:0,right:0,borderBottomWidth:3,borderRightWidth:3,borderBottomRightRadius:4}:{}),
          }} />
        ))}
      </div>
      <div style={{ marginTop: 14, color: '#a3e635', fontSize: 13, fontWeight: 600, letterSpacing: 0.3, textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>
        Aim at barcode
      </div>
    </div>
  )
}

function CentredOverlay({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.75)'
    }}>
      {children}
    </div>
  )
}
