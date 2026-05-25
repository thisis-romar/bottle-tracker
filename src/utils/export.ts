import type { ContainerItem, Session } from '../db'

function escapeCSV(val: string | number | undefined): string {
  const s = String(val ?? '')
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function itemsToCSV(items: ContainerItem[], session?: Session): string {
  const header = [
    'Date', 'Time', 'Barcode', 'Name', 'Material',
    'Volume (mL)', 'Qty', 'Refund Each', 'Subtotal'
  ]

  const rows = items.map(item => {
    const d = new Date(item.scannedAt)
    return [
      d.toLocaleDateString('en-CA'),
      d.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' }),
      item.barcode ?? '',
      item.name ?? `${item.material} ${item.volumeMl}mL`,
      item.material,
      item.volumeMl,
      item.quantity,
      `$${(item.refundCents / 100).toFixed(2)}`,
      `$${((item.refundCents * item.quantity) / 100).toFixed(2)}`
    ]
  })

  const totalQty = items.reduce((s, i) => s + i.quantity, 0)
  const totalCents = items.reduce((s, i) => s + i.refundCents * i.quantity, 0)
  const summaryRow = ['', '', '', 'TOTAL', '', '', totalQty, '', `$${(totalCents / 100).toFixed(2)}`]

  const lines = [header, ...rows, summaryRow]
  return lines.map(row => row.map(escapeCSV).join(',')).join('\n')
}

export function downloadCSV(csv: string, filename: string): void {
  const bom = '\uFEFF' // UTF-8 BOM for Excel compatibility
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
