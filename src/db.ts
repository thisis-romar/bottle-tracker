import Dexie, { type Table } from 'dexie'

export type Material = 'glass' | 'aluminum' | 'plastic' | 'tetra' | 'unknown'

export interface ContainerItem {
  id?: number
  barcode?: string
  name?: string
  material: Material
  volumeMl: number
  quantity: number
  refundCents: 10 | 20
  scannedAt: string
  sessionKey: string // matches Session.sessionKey
}

export interface Session {
  id?: number
  sessionKey: string  // e.g. "session_1716000000000_ab12cd"
  startedAt: string
  finishedAt?: string
  totalItems: number
  totalRefundCents: number
  note?: string
}

export interface BarcodeMapping {
  barcode: string
  name?: string
  material: Material
  volumeMl: number
  refundCents: 10 | 20
  updatedAt: string
}

class BottleDB extends Dexie {
  items!: Table<ContainerItem>
  sessions!: Table<Session>
  barcodes!: Table<BarcodeMapping>

  constructor() {
    super('BottleReturnTracker')
    this.version(1).stores({
      items: '++id, barcode, sessionKey, scannedAt',
      sessions: '++id, sessionKey, startedAt, finishedAt',
      barcodes: 'barcode, updatedAt'
    })
  }
}

export const db = new BottleDB()
