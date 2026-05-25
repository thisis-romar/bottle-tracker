/**
 * Plays a short confirmation beep using the Web Audio API.
 * Sounds like a barcode scanner — square wave, quick decay.
 * Safe to call rapidly; reuses a single AudioContext.
 */

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  try {
    if (!ctx || ctx.state === 'closed') {
      ctx = new AudioContext()
    }
    return ctx
  } catch {
    return null
  }
}

export interface BeepOptions {
  frequency?: number  // Hz, default 1100 (high, scanner-like)
  duration?: number   // ms, default 80
  volume?: number     // 0–1, default 0.35
}

export async function playBeep(opts?: BeepOptions): Promise<void> {
  const { frequency = 1100, duration = 80, volume = 0.35 } = opts ?? {}

  const audioCtx = getCtx()
  if (!audioCtx) return

  // Browsers suspend AudioContext until a user gesture — resume if needed
  if (audioCtx.state === 'suspended') {
    try { await audioCtx.resume() } catch { return }
  }

  const oscillator = audioCtx.createOscillator()
  const gain = audioCtx.createGain()

  oscillator.connect(gain)
  gain.connect(audioCtx.destination)

  oscillator.type = 'square'
  oscillator.frequency.value = frequency

  const now = audioCtx.currentTime
  gain.gain.setValueAtTime(volume, now)
  // Exponential decay for a clean "bip" not a harsh cut
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration / 1000)

  oscillator.start(now)
  oscillator.stop(now + duration / 1000 + 0.02) // tiny tail to avoid click
}

/** Warm up AudioContext on first user interaction so beep works immediately */
export function primeAudio(): void {
  getCtx()
}
