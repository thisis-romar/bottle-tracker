import { useState, useCallback, useEffect } from 'react'
import {
  loadTokens,
  clearTokens,
  initiateOAuth,
  handleOAuthCallback,
  type GoogleTokens
} from '../utils/googleAuth'
import { clearSheetsCache } from '../utils/googleSheets'

export interface GoogleAuthState {
  connected: boolean
  tokens: GoogleTokens | null
  /** True while the OAuth callback is being processed */
  loading: boolean
  error: string | null
}

export function useGoogleAuth() {
  const [state, setState] = useState<GoogleAuthState>(() => {
    const tokens = loadTokens()
    return { connected: !!tokens, tokens, loading: false, error: null }
  })

  // Handle OAuth callback on mount (runs once when app loads with ?code= in URL)
  useEffect(() => {
    if (!window.location.search.includes('code=')) return

    setState(s => ({ ...s, loading: true, error: null }))

    handleOAuthCallback().then(handled => {
      if (!handled) {
        setState(s => ({ ...s, loading: false }))
        return
      }
      const tokens = loadTokens()
      setState({ connected: !!tokens, tokens, loading: false, error: null })
    }).catch(err => {
      setState(s => ({
        ...s, loading: false,
        error: err instanceof Error ? err.message : 'Authentication failed'
      }))
    })
  }, [])

  const connect = useCallback(async () => {
    setState(s => ({ ...s, error: null }))
    try {
      await initiateOAuth() // redirects — this line won't be reached
    } catch (err) {
      setState(s => ({
        ...s,
        error: err instanceof Error ? err.message : 'Could not start sign-in'
      }))
    }
  }, [])

  const disconnect = useCallback(() => {
    clearTokens()
    clearSheetsCache()
    setState({ connected: false, tokens: null, loading: false, error: null })
  }, [])

  return { ...state, connect, disconnect }
}
