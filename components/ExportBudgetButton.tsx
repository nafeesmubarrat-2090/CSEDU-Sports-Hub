'use client'

type ExportBudgetButtonProps = {
  eventName: string
  entries: {
    type: string
    label: string
    amount: number | null
    recorderName: string
    date: string
    proofUrl: string | null
  }[]
}

export default function ExportBudgetButton({ eventName, entries }: ExportBudgetButtonProps) {
  function downloadCsv() {
    const headers = ['Type', 'Label', 'Amount (BDT)', 'Recorded By', 'Date', 'Proof URL']
    const rows = entries.map((e) => [
      `"${e.type}"`,
      `"${e.label.replace(/"/g, '""')}"`,
      e.amount ?? 0,
      `"${e.recorderName.replace(/"/g, '""')}"`,
      `"${e.date}"`,
      `"${e.proofUrl ?? ''}"`,
    ])

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const safeName = eventName.toLowerCase().replace(/[^a-z0-9]/g, '_')
    link.setAttribute('href', url)
    link.setAttribute('download', `${safeName}_budget_ledger.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <button
      type="button"
      onClick={downloadCsv}
      className="btn-secondary flex items-center gap-2 text-xs py-1.5 px-3"
      title="Export budget ledger as CSV file"
    >
      <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      Export CSV
    </button>
  )
}
