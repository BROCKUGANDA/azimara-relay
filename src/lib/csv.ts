// RFC-4180-style CSV parsing/serialization without external dependencies.

export function parseCsv(input: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  const text = input.replace(/^\uFEFF/, '')
  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += ch
      i++
      continue
    }
    if (ch === '"') {
      inQuotes = true
      i++
      continue
    }
    if (ch === ',') {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (ch === '\r') {
      i++
      continue
    }
    if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
      continue
    }
    field += ch
    i++
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

export function csvToObjects(input: string): { headers: string[]; rows: Record<string, string>[] } {
  const matrix = parseCsv(input)
  if (matrix.length === 0) return { headers: [], rows: [] }
  const headers = matrix[0].map((h) => h.trim())
  const rows = matrix.slice(1).map((cells) => {
    const obj: Record<string, string> = {}
    headers.forEach((h, idx) => {
      obj[h] = (cells[idx] ?? '').trim()
    })
    return obj
  })
  return { headers, rows }
}

export function csvEscape(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? '' : String(value)
  // Neutralize spreadsheet formula injection (=, +, -, @ prefixes execute as
  // formulas when exported recipients are opened in Excel/Sheets).
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  if (/^\d{1,}[-/]\d{1,2}[-/]\d{1,2}/.test(s)) s = `'${s}` // date coercion
  if (/^[A-Z]{1,3}\d+:/i.test(s)) s = `'${s}` // cell-range coercion
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function buildCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers.map(csvEscape).join(',')]
  for (const row of rows) lines.push(row.map(csvEscape).join(','))
  return lines.join('\n') + '\n'
}
