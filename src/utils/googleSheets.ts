/**
 * Google Sheets API v4 — append session data to a spreadsheet.
 * Finds or creates "Ontario Bottle Tracker" in the user's Drive.
 */

import { getAccessToken } from './googleAuth'
import type { ContainerItem, Session } from '../db'
import { formatCents } from './refund'

const SPREADSHEET_NAME = 'Ontario Bottle Tracker'
const SPREADSHEET_ID_KEY = 'google_spreadsheet_id'

const ITEM_HEADERS = [
  'Date', 'Session', 'Barcode', 'Name',
  'Material', 'Volume (mL)', 'Qty', 'Refund Each', 'Subtotal'
]

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ExportResult {
  spreadsheetId: string
  spreadsheetUrl: string
  rowsAdded: number
}

/** Export a single session's items. Creates the spreadsheet if it doesn't exist. */
export async function exportSession(
  items: ContainerItem[],
  session?: Session
): Promise<ExportResult> {
  const token         = await getAccessToken()
  const spreadsheetId = await getOrCreateSpreadsheet(token)

  const dateStr   = new Date(session?.startedAt ?? items[0]?.scannedAt ?? Date.now())
    .toLocaleDateString('en-CA')
  const sessionLabel = session?.note
    ? `${dateStr} — ${session.note}`
    : dateStr

  const rows: (string | number)[][] = items.map(item => [
    new Date(item.scannedAt).toLocaleDateString('en-CA'),
    sessionLabel,
    item.barcode ?? '',
    item.name ?? `${item.material} ${item.volumeMl} mL`,
    item.material,
    item.volumeMl,
    item.quantity,
    formatCents(item.refundCents),
    formatCents(item.refundCents * item.quantity)
  ])

  // Summary row
  const totalQty   = items.reduce((s, i) => s + i.quantity, 0)
  const totalCents = items.reduce((s, i) => s + i.refundCents * i.quantity, 0)
  rows.push(['', sessionLabel + ' TOTAL', '', '', '', '', totalQty, '', formatCents(totalCents)])
  rows.push([]) // blank separator

  await appendRows(token, spreadsheetId, rows)

  return {
    spreadsheetId,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
    rowsAdded: rows.length
  }
}

// ─── Spreadsheet management ───────────────────────────────────────────────────

async function getOrCreateSpreadsheet(token: string): Promise<string> {
  // Check cached ID first
  const cached = localStorage.getItem(SPREADSHEET_ID_KEY)
  if (cached) {
    // Verify it still exists
    const ok = await verifySpreadsheet(token, cached)
    if (ok) return cached
    localStorage.removeItem(SPREADSHEET_ID_KEY)
  }

  // Search Drive for existing sheet
  const searchRes = await gFetch<{ files?: Array<{ id: string; name: string }> }>(token,
    `https://www.googleapis.com/drive/v3/files` +
    `?q=name='${encodeURIComponent(SPREADSHEET_NAME)}'` +
    ` and mimeType='application/vnd.google-apps.spreadsheet'` +
    ` and trashed=false` +
    `&fields=files(id,name)`
  )
  if (searchRes.files && searchRes.files.length > 0) {
    const id = searchRes.files[0].id
    localStorage.setItem(SPREADSHEET_ID_KEY, id)
    return id
  }

  // Create a new spreadsheet with header row
  const created = await gPost<{ spreadsheetId: string }>(token, 'https://sheets.googleapis.com/v4/spreadsheets', {
    properties: { title: SPREADSHEET_NAME },
    sheets: [{
      properties: { title: 'Returns', sheetId: 0 }
    }]
  })
  const id = created.spreadsheetId

  // Write headers
  await appendRows(token, id, [ITEM_HEADERS])

  // Format header row (bold, freeze)
  await gPost(token,
    `https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`,
    {
      requests: [
        {
          repeatCell: {
            range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: 'userEnteredFormat.textFormat.bold'
          }
        },
        {
          updateSheetProperties: {
            properties: { sheetId: 0, gridProperties: { frozenRowCount: 1 } },
            fields: 'gridProperties.frozenRowCount'
          }
        }
      ]
    }
  )

  localStorage.setItem(SPREADSHEET_ID_KEY, id)
  return id
}

async function verifySpreadsheet(token: string, id: string): Promise<boolean> {
  try {
    await gFetch(token,
      `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=spreadsheetId`
    )
    return true
  } catch {
    return false
  }
}

async function appendRows(
  token: string,
  spreadsheetId: string,
  rows: (string | number)[][]
): Promise<void> {
  await gPost(
    token,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}` +
    `/values/Returns!A:I:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { values: rows }
  )
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function gFetch<T = Record<string, unknown>>(token: string, url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  })
  const data = await res.json() as T & { error?: { message?: string } }
  if (!res.ok) throw new Error(data?.error?.message ?? `HTTP ${res.status}`)
  return data
}

async function gPost<T = Record<string, unknown>>(
  token: string,
  url: string,
  body: unknown
): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
  const data = await res.json() as T & { error?: { message?: string } }
  if (!res.ok) throw new Error(data?.error?.message ?? `HTTP ${res.status}`)
  return data
}

/** Clear cached spreadsheet ID (e.g. after disconnect) */
export function clearSheetsCache(): void {
  localStorage.removeItem(SPREADSHEET_ID_KEY)
}
