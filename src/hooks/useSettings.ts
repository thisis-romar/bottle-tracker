import { useState, useCallback } from 'react'

export interface AppSettings {
  soundEnabled: boolean
  vibrateEnabled: boolean
}

const SETTINGS_KEY = 'bottle_app_settings'

const DEFAULTS: AppSettings = {
  soundEnabled: true,
  vibrateEnabled: true
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
