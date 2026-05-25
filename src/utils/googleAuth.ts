/**
 * Google OAuth2 PKCE flow for PWAs.
 * No client secret needed — uses code_verifier/code_challenge only.
 *
 * Setup (one-time, per deployment):
 *  1. Google Cloud Console → APIs & Services → Credentials
 *  2. Create OAuth 2.0 Client ID → Web application
 *  3. Add your app URL to "Authorised redirect URIs"
 *     e.g. https://YOUR_USERNAME.github.io/bottle-tracker/
 *     and  http://localhost:5173/ (for dev)
 *  4. Copy the Client ID (not secret) → VITE_GOOGLE_CLIENT_ID in .env.local
 */

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'email',
  'profile'
].join(' ')

const TOKEN_STORAGE_KEY = 'google_tokens_v1'
const CODE_VERIFIER_KEY  = 'google_pkce_verifier'
const OAUTH_STATE_KEY    = 'google_oauth_state'

// ─── Token storage ────────────────────────────────────────────────────────────

export interface GoogleTokens {
  accessToken: string
  refreshToken?: string
  expiresAt: number   // Unix epoch ms
  email?: string
  name?: string
  picture?: string
}

export function loadTokens(): GoogleTokens | null {
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as GoogleTokens) : null
  } catch {
    return null
  }
}

function saveTokens(t: GoogleTokens): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(t))
}

export function clearTokens(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY)
  sessionStorage.removeItem(CODE_VERIFIER_KEY)
  sessionStorage.removeItem(OAUTH_STATE_KEY)
}

export function isConnected(): boolean {
  return !!loadTokens()
}

// ─── PKCE helpers ─────────────────────────────────────────────────────────────

function base64UrlEncode(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...Array.from(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

function randomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n)
  crypto.getRandomValues(buf)
  return buf
}

async function sha256(plain: string): Promise<Uint8Array> {
  const buf = new TextEncoder().encode(plain)
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return new Uint8Array(digest)
}

// ─── Initiate OAuth flow ──────────────────────────────────────────────────────

export async function initiateOAuth(): Promise<void> {
  if (!CLIENT_ID) {
    throw new Error('VITE_GOOGLE_CLIENT_ID is not set. See .env.example.')
  }

  const verifier   = base64UrlEncode(randomBytes(32))
  const challenge  = base64UrlEncode(await sha256(verifier))
  const state      = base64UrlEncode(randomBytes(16))
  const redirectUri = getRedirectUri()

  sessionStorage.setItem(CODE_VERIFIER_KEY, verifier)
  sessionStorage.setItem(OAUTH_STATE_KEY, state)

  const params = new URLSearchParams({
    client_id:             CLIENT_ID,
    redirect_uri:          redirectUri,
    response_type:         'code',
    scope:                 SCOPES,
    code_challenge:        challenge,
    code_challenge_method: 'S256',
    state,
    access_type:           'offline',
    prompt:                'consent'
  })

  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

// ─── Handle callback ──────────────────────────────────────────────────────────

export async function handleOAuthCallback(): Promise<boolean> {
  const params   = new URLSearchParams(window.location.search)
  const code     = params.get('code')
  const state    = params.get('state')
  const error    = params.get('error')

  if (!code && !error) return false

  window.history.replaceState({}, document.title, window.location.pathname)

  if (error) {
    console.warn('[googleAuth] OAuth error:', error)
    return true
  }

  const storedState  = sessionStorage.getItem(OAUTH_STATE_KEY)
  const codeVerifier = sessionStorage.getItem(CODE_VERIFIER_KEY)

  if (state !== storedState) {
    console.error('[googleAuth] State mismatch')
    return true
  }
  if (!codeVerifier) {
    console.error('[googleAuth] No code verifier')
    return true
  }

  await exchangeCode(code!, codeVerifier)
  return true
}

async function exchangeCode(code: string, codeVerifier: string): Promise<void> {
  const body = new URLSearchParams({
    client_id:     CLIENT_ID,
    code,
    code_verifier: codeVerifier,
    grant_type:    'authorization_code',
    redirect_uri:  getRedirectUri()
  })

  const res  = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })
  const data = await res.json() as Record<string, string | number>
  if (!res.ok) throw new Error((data['error_description'] as string) ?? 'Token exchange failed')

  const tokens = await buildTokenRecord(data)
  saveTokens(tokens)
  sessionStorage.removeItem(CODE_VERIFIER_KEY)
  sessionStorage.removeItem(OAUTH_STATE_KEY)
}

// ─── Token refresh ────────────────────────────────────────────────────────────

export async function getAccessToken(): Promise<string> {
  const tokens = loadTokens()
  if (!tokens) throw new Error('Not authenticated with Google')

  if (Date.now() < tokens.expiresAt - 5 * 60 * 1000) {
    return tokens.accessToken
  }

  if (!tokens.refreshToken) {
    clearTokens()
    throw new Error('Session expired — please reconnect Google.')
  }

  return refreshAccessToken(tokens.refreshToken)
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const body = new URLSearchParams({
    client_id:     CLIENT_ID,
    refresh_token: refreshToken,
    grant_type:    'refresh_token'
  })

  const res  = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })
  const data = await res.json() as Record<string, string | number>
  if (!res.ok) {
    clearTokens()
    throw new Error((data['error_description'] as string) ?? 'Token refresh failed')
  }

  const existing = loadTokens()!
  const updated: GoogleTokens = {
    ...existing,
    accessToken: data['access_token'] as string,
    expiresAt:   Date.now() + (data['expires_in'] as number) * 1000
  }
  saveTokens(updated)
  return updated.accessToken
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function buildTokenRecord(data: Record<string, string | number>): Promise<GoogleTokens> {
  const tokens: GoogleTokens = {
    accessToken:  data['access_token'] as string,
    refreshToken: data['refresh_token'] as string | undefined,
    expiresAt:    Date.now() + (data['expires_in'] as number) * 1000
  }

  try {
    const res  = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.accessToken}` }
    })
    const info = await res.json() as { email?: string; name?: string; picture?: string }
    tokens.email   = info.email
    tokens.name    = info.name
    tokens.picture = info.picture
  } catch { /* non-fatal */ }

  return tokens
}

function getRedirectUri(): string {
  return `${window.location.origin}${window.location.pathname}`
}
