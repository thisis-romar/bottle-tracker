import { useState, useCallback } from 'react'

export type VisionMode = 'mock' | 'byok' | 'proxy'
export type VisionModel = 'claude-haiku-4-5' | 'claude-sonnet-4-6' | 'claude-opus-4-7'

export interface AppSettings {
  soundEnabled: boolean
  vibrateEnabled: boolean
  /** Capture the can photo and cross-validate details across sources (experimental). */
  aiDetailsEnabled: boolean
  /** Read size/ABV off the label on-device with OCR (offline, no API key). */
  ocrEnabled: boolean
  /** Which on-can vision extractor to use when aiDetailsEnabled is on. */
  visionMode: VisionMode
  /** Claude model used by the byok/proxy extractor. */
  visionModel: VisionModel
  /** Anthropic API key for bring-your-own-key mode (stored on this device only). */
  anthropicApiKey: string
  /** Serverless proxy URL for proxy mode. */
  visionProxyUrl: string
  /** Optional shared secret sent as x-proxy-secret, if the Worker sets PROXY_SECRET. */
  visionProxySecret: string
}

const SETTINGS_KEY = 'bottle_app_settings'

const DEFAULTS: AppSettings = {
  soundEnabled: true,
  vibrateEnabled: true,
  aiDetailsEnabled: false,
  ocrEnabled: false,
  visionMode: 'mock',
  visionModel: 'claude-haiku-4-5',
  anthropicApiKey: '',
  visionProxyUrl: '',
  visionProxySecret: ''
}

function load(): AppSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}')
    return { ...DEFAULTS, ...stored }
  } catch {
    return DEFAULTS
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(load)

  const update = useCallback((patch: Partial<AppSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch }
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  return { settings, update }
}
