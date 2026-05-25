import { useState, useCallback } from 'react'

export type VisionMode = 'mock' | 'byok' | 'proxy'

export interface AppSettings {
  soundEnabled: boolean
  vibrateEnabled: boolean
  /** Capture the can photo and cross-validate details across sources (experimental). */
  aiDetailsEnabled: boolean
  /** Which on-can vision extractor to use when aiDetailsEnabled is on. */
  visionMode: VisionMode
  /** Anthropic API key for bring-your-own-key mode (stored on this device only). */
  anthropicApiKey: string
  /** Serverless proxy URL for proxy mode. */
  visionProxyUrl: string
}

const SETTINGS_KEY = 'bottle_app_settings'

const DEFAULTS: AppSettings = {
  soundEnabled: true,
  vibrateEnabled: true,
  aiDetailsEnabled: false,
  visionMode: 'mock',
  anthropicApiKey: '',
  visionProxyUrl: ''
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
