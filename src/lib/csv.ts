import type { ExportData } from './types'

/**
 * Escape one CSV cell (RFC 4180) and neutralise spreadsheet formula
 * injection: cells starting with = + - @ (or tab/CR) are prefixed with '.
 */
export function escapeCsvCell(value: string | number | null | undefined): string {
  let s = value == null ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`
  return s
}

export function toCsvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(escapeCsvCell).join(',')
}

/**
 * One row per response. Header row: response_id, submitted_at, then each
 * question's text in survey order. Cells contain the chosen choice text.
 */
export function buildResultsCsv(data: ExportData): string {
  const questions = [...data.questions].sort((a, b) => a.position - b.position)
  const choiceText = new Map<string, string>()
  for (const q of questions) for (const c of q.choices) choiceText.set(c.id, c.choice_text)

  const byResponse = new Map<string, Map<string, string>>()
  for (const a of data.answers) {
    if (!byResponse.has(a.response_id)) byResponse.set(a.response_id, new Map())
    byResponse
      .get(a.response_id)!
      .set(a.question_id, a.choice_id ? (choiceText.get(a.choice_id) ?? '') : '')
  }

  const header = toCsvRow([
    'response_id',
    'submitted_at',
    ...questions.map((q, i) => `Q${i + 1}: ${q.question_text}`),
  ])
  const responses = [...data.responses].sort((a, b) => a.submitted_at.localeCompare(b.submitted_at))
  const rows = responses.map((r) => {
    const answers = byResponse.get(r.id)
    return toCsvRow([r.id, r.submitted_at, ...questions.map((q) => answers?.get(q.id) ?? '')])
  })
  return [header, ...rows].join('\r\n') + '\r\n'
}

export function csvFilename(title: string, date = new Date()): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'survey'
  return `${slug}-results-${date.toISOString().slice(0, 10)}.csv`
}

/** Trigger a browser download. UTF-8 BOM so Excel detects the encoding. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
