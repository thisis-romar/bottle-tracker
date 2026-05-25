import { useState, useCallback } from 'react'
import { db } from '../db'

const SESSION_STORAGE_KEY = 'bottle_tracker_session_key'

function generateSessionKey(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function getOrCreateSessionKey(): string {
  const stored = localStorage.getItem(SESSION_STORAGE_KEY)
  if (stored) return stored
  const key = generateSessionKey()
  localStorage.setItem(SESSION_STORAGE_KEY, key)
  return key
}

export function useSession() {
  const [sessionKey, setSessionKey] = useState<string>(getOrCreateSessionKey)

  /** Save the current bag to history, return the new session DB id */
  const finishSession = useCallback(async (note?: string): Promise<number | null> => {
    const items = await db.items.where('sessionKey').equals(sessionKey).toArray()
    if (items.length === 0) return null

    const totalItems = items.reduce((s, i) => s + i.quantity, 0)
    const totalRefundCents = items.reduce((s, i) => s + i.refundCents * i.quantity, 0)

    const id = await db.sessions.add({
      sessionKey,
      startedAt: items.map(i => i.scannedAt).sort()[0],
      finishedAt: new Date().toISOString(),
      totalItems,
      totalRefundCents,
      note
    })

    const newKey = generateSessionKey()
    localStorage.setItem(SESSION_STORAGE_KEY, newKey)
    setSessionKey(newKey)
    return id as number
  }, [sessionKey])

  /** Discard current bag (delete items, start fresh) */
  const clearSession = useCallback(async () => {
    await db.items.where('sessionKey').equals(sessionKey).delete()
    const newKey = generateSessionKey()
    localStorage.setItem(SESSION_STORAGE_KEY, newKey)
    setSessionKey(newKey)
  }, [sessionKey])

  return { sessionKey, finishSession, clearSession }
}
