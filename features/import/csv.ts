/**
 * A small, dependency-free CSV parser (RFC-4180-ish) — the inbound half the repo didn't
 * have yet (manager/reporting only SERIALISES csv). Pure string-in → rows-out: the UI reads
 * the File with a FileReader and hands the text here, so this stays testable and isomorphic.
 *
 * Handles: quoted fields with embedded commas / newlines / escaped `""`, CRLF or LF line
 * endings, a leading UTF-8 BOM, and ragged rows (short rows pad, long rows keep extras under
 * synthesised headers). Blank lines are skipped.
 */

export interface ParsedCsv {
  headers: string[]
  rows: Record<string, string>[]
}

/** Tokenise CSV text into a grid of cells, honouring quotes. */
function toGrid(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text // strip BOM
  const grid: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let started = false // did this row have any content (so a trailing newline doesn't add a row)?

  const endField = () => {
    row.push(field)
    field = ''
  }
  const endRow = () => {
    endField()
    // Skip a row that is a single empty cell (a blank line).
    if (!(row.length === 1 && row[0] === '')) grid.push(row)
    row = []
    started = false
  }

  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++ // consume the escaped quote
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
      continue
    }
    if (c === '"') {
      inQuotes = true
      started = true
    } else if (c === ',') {
      endField()
      started = true
    } else if (c === '\r') {
      // swallow; the \n (or end) closes the row
    } else if (c === '\n') {
      endRow()
    } else {
      field += c
      started = true
    }
  }
  // Flush the last field/row if the file didn't end with a newline.
  if (started || field !== '' || row.length > 0) endRow()
  return grid
}

/**
 * Parse CSV text into headers + objects keyed by header. The first non-empty line is the
 * header row. A cell with no header (a row longer than the header) is keyed `col{n}`; a
 * short row leaves missing headers as ''.
 */
export function parseCsv(text: string): ParsedCsv {
  const grid = toGrid(text)
  if (grid.length === 0) return { headers: [], rows: [] }
  const headers = grid[0].map((h) => h.trim())
  const rows: Record<string, string>[] = []
  for (let r = 1; r < grid.length; r++) {
    const cells = grid[r]
    const obj: Record<string, string> = {}
    const width = Math.max(headers.length, cells.length)
    for (let c = 0; c < width; c++) {
      const key = headers[c] || `col${c + 1}`
      obj[key] = (cells[c] ?? '').trim()
    }
    rows.push(obj)
  }
  return { headers, rows }
}
