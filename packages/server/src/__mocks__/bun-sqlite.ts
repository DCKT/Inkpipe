// Mock for bun:sqlite in vitest (Node.js environment)
// Map-backed in-memory storage so Config + JobStore live layers can be tested.

type Row = Record<string, unknown>

const tables = new Map<string, Row[]>()

function ensureTable(name: string): Row[] {
  let rows = tables.get(name)
  if (!rows) {
    rows = []
    tables.set(name, rows)
  }
  return rows
}

// Very simple SQL subset parser — enough for the SQL used in this project.
function parseInsertColumns(sql: string): string[] | null {
  const m = sql.match(/insert\s+(?:or\s+replace\s+)?into\s+\w+\s*\(([^)]+)\)/i)
  if (!m) return null
  return m[1].split(",").map((s) => s.trim())
}

function parseUpdateTableAndSets(sql: string): { table: string; sets: string[] } | null {
  const m = sql.match(/update\s+(\w+)\s+set\s+(.+?)\s+where/i)
  if (!m) return null
  return { table: m[1], sets: m[2].split(",").map((s) => s.trim()) }
}

function parseSelectColumns(sql: string): string[] {
  const m = sql.match(/select\s+(.+?)\s+from/i)
  if (!m) return []
  if (m[1].trim() === "*") return []
  return m[1].split(",").map((s) => s.trim())
}

function parseSelectFrom(sql: string): string {
  const m = sql.match(/from\s+(\w+)/i)
  return m?.[1] ?? ""
}

function parseWhereColumn(sql: string): string | null {
  const m = sql.match(/where\s+(\w+)\s*=/i)
  return m?.[1] ?? null
}

export class Database {
  constructor(_dbPath: string) {
    void _dbPath
  }

  run(_sql: string): { changes: number; lastInsertRowid: number } {
    const sql = _sql.trim()
    if (sql.toUpperCase().startsWith("PRAGMA")) return { changes: 0, lastInsertRowid: 0 }

    const createMatch = sql.match(/create\s+table\s+(?:if\s+not\s+exists\s+)?(\w+)/i)
    if (createMatch) {
      ensureTable(createMatch[1])
      return { changes: 0, lastInsertRowid: 0 }
    }

    return { changes: 0, lastInsertRowid: 0 }
  }

  prepare(sql: string) {
    const trimmed = sql.trim()
    const upper = trimmed.toUpperCase()

    if (upper.startsWith("INSERT")) {
      const columns = parseInsertColumns(trimmed)
      const tableMatch = trimmed.match(/into\s+(\w+)/i)
      const table = tableMatch?.[1] ?? ""

      return {
        run: (...params: unknown[]) => {
          const rows = ensureTable(table)
          const row: Row = {}
          if (columns) {
            for (let i = 0; i < columns.length; i++) {
              row[columns[i]] = params[i] ?? null
            }
          }
          // INSERT OR REPLACE: remove existing row with same PK (first column)
          if (columns && columns.length > 0) {
            const pkCol = columns[0]
            const idx = rows.findIndex((r) => r[pkCol] === row[pkCol])
            if (idx >= 0) rows.splice(idx, 1)
          }
          rows.push(row)
          return { changes: 1, lastInsertRowid: rows.length }
        },
        all: () => [],
        get: () => undefined,
      }
    }

    if (upper.startsWith("UPDATE")) {
      const parsed = parseUpdateTableAndSets(trimmed)
      return {
        run: (...params: unknown[]) => {
          if (!parsed) return { changes: 0, lastInsertRowid: 0 }
          const rows = ensureTable(parsed.table)
          const whereCol = parseWhereColumn(trimmed)
          const whereVal = params[params.length - 1] // last param is WHERE value
          const setValues = params.slice(0, -1)

          for (const row of rows) {
            if (whereCol && row[whereCol] === whereVal) {
              for (let i = 0; i < parsed.sets.length; i++) {
                const col = parsed.sets[i].split("=")[0].trim()
                row[col] = setValues[i] ?? null
              }
            }
          }
          return { changes: 1, lastInsertRowid: 0 }
        },
        all: () => [],
        get: () => undefined,
      }
    }

    // Default
    return {
      run: () => ({ changes: 0, lastInsertRowid: 0 }),
      all: () => [],
      get: () => undefined,
    }
  }

  query(sql: string) {
    const trimmed = sql.trim()
    const table = parseSelectFrom(trimmed)
    parseSelectColumns(trimmed)
    const whereCol = parseWhereColumn(trimmed)

    return {
      all: () => {
        const rows = ensureTable(table)
        if (trimmed.toUpperCase().includes("ORDER BY")) {
          return [...rows] as Row[]
        }
        return rows as Row[]
      },
      get: (...params: unknown[]) => {
        const rows = ensureTable(table)
        if (whereCol && params.length > 0) {
          return rows.find((r) => r[whereCol] === params[0]) as Row | undefined
        }
        return rows[0] as Row | undefined
      },
    }
  }

  transaction(fn: () => void): () => void {
    // Return fn so caller can invoke it (e.g. `const runAll = db.transaction(...); runAll()`)
    return fn
  }
}

// Reset all tables — called in beforeEach
export function resetMockDb(): void {
  tables.clear()
}
