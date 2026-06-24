interface RunResult {
  changes: number
  lastInsertRowid: number | bigint
}

interface QueryResult {
  all: (...params: unknown[]) => Record<string, unknown>[]
  values: (...params: unknown[]) => unknown[][]
  get: (...params: unknown[]) => Record<string, unknown> | undefined
}

const tables = new Map<string, Record<string, unknown>[]>()

function parseInsert(sql: string): { table: string; values: Record<string, unknown> } | null {
  const match = sql.match(/insert\s+into\s+(\w+)\s*\(([^)]+)\)\s*values\s*\(([^)]+)\)/i)
  if (!match) return null
  const table = match[1]
  const cols = match[2].split(",").map((c) => c.trim())
  const vals = match[3].split(",").map((v) => {
    const trimmed = v.trim()
    if (trimmed === "NULL") return null
    if (trimmed.startsWith("'") || trimmed.startsWith("\"")) return trimmed.slice(1, -1)
    const num = Number(trimmed)
    if (!isNaN(num)) return num
    return trimmed
  })
  const row: Record<string, unknown> = {}
  for (let i = 0; i < cols.length; i++) {
    row[cols[i]] = vals[i]
  }
  return { table, values: row }
}

function parseCreateTable(sql: string): { table: string; columns: string[] } | null {
  const match = sql.match(/create\s+table\s+(?:if\s+not\s+exists\s+)?(\w+)\s*\((.+)\)/is)
  if (!match) return null
  return { table: match[1], columns: [] }
}

class Database {
  constructor(public filename: string, _options?: Record<string, unknown>) {}

  run(sql: string, ..._params: unknown[]): RunResult {
    const sqlLower = sql.toLowerCase().trim()

    if (sqlLower.startsWith("create")) {
      const parsed = parseCreateTable(sql)
      if (parsed && !tables.has(parsed.table)) {
        tables.set(parsed.table, [])
      }
      return { changes: 0, lastInsertRowid: 0 }
    }

    if (sqlLower.startsWith("insert")) {
      const parsed = parseInsert(sql)
      if (parsed) {
        if (!tables.has(parsed.table)) tables.set(parsed.table, [])
        const rows = tables.get(parsed.table)!
        const id = rows.length > 0 ? (rows[rows.length - 1].id as number) + 1 : 1
        const newRow = { id, ...parsed.values }
        rows.push(newRow)
        return { changes: 1, lastInsertRowid: id }
      }
    }

    if (sqlLower.startsWith("delete")) {
      const tableMatch = sqlLower.match(/delete\s+from\s+(\w+)/i)
      if (tableMatch && tables.has(tableMatch[1])) {
        const initial = tables.get(tableMatch[1])!.length
        tables.set(tableMatch[1], [])
        return { changes: initial, lastInsertRowid: 0 }
      }
    }

    if (sqlLower.startsWith("pragma")) {
      return { changes: 0, lastInsertRowid: 0 }
    }

    if (sqlLower.startsWith("insert or replace")) {
      const insertMatch = sql.match(/insert\s+or\s+replace\s+into\s+(\w+)\s*\(([^)]+)\)\s*values\s*\(([^)]+)\)/i)
      if (insertMatch) {
        const table = insertMatch[1]
        const cols = insertMatch[2].split(",").map((c) => c.trim())
        const vals = insertMatch[3].split(",").map((v) => {
          const trimmed = v.trim()
          if (trimmed === "NULL") return null
          if (trimmed.startsWith("'")) return trimmed.slice(1, -1)
          const num = Number(trimmed)
          if (!isNaN(num)) return num
          return trimmed
        })
        if (!tables.has(table)) tables.set(table, [])
        const rows = tables.get(table)!
        const existingIdx = rows.findIndex((r: Record<string, unknown>) => r.key === vals[0])
        const row: Record<string, unknown> = {}
        for (let i = 0; i < cols.length; i++) row[cols[i]] = vals[i]
        if (existingIdx >= 0) {
          rows[existingIdx] = { ...rows[existingIdx], ...row }
        } else {
          rows.push(row)
        }
        return { changes: 1, lastInsertRowid: 0 }
      }
    }

    if (sqlLower.startsWith("update")) {
      return { changes: 0, lastInsertRowid: 0 }
    }

    return { changes: 0, lastInsertRowid: 0 }
  }

  query(sql: string): QueryResult {
    const sqlLower = sql.trim().toLowerCase()

    const selectMatch = sqlLower.match(/select\s+(.+?)\s+from\s+(\w+)/i)
    let table: string | undefined
    if (selectMatch) table = selectMatch[2]

    if (table && sqlLower.includes("sqlite_master")) {
      return {
        all: (..._params: unknown[]) => {
          const result: Record<string, unknown>[] = []
          for (const [name] of tables) {
            result.push({ type: "table", name })
          }
          return result
        },
        values: (..._params: unknown[]) => [],
        get: (..._params: unknown[]) => undefined,
      }
    }

    if (table && tables.has(table)) {
      const allRows = tables.get(table)!

      return {
        all: (..._params: unknown[]) => {
          return allRows.map((r: Record<string, unknown>) => ({ ...r }))
        },
        values: (..._params: unknown[]) => {
          return allRows.map((r: Record<string, unknown>) => Object.values(r))
        },
        get: (..._params: unknown[]) => {
          return allRows.length > 0 ? { ...allRows[0] } : undefined
        },
      }
    }

    return {
      all: (..._params: unknown[]) => [],
      values: (..._params: unknown[]) => [],
      get: (..._params: unknown[]) => undefined,
    }
  }

  prepare(_sql: string) {
    return {
      run: (..._params: unknown[]) => this.run(_sql, ..._params),
      all: (..._params: unknown[]) => this.query(_sql).all(..._params),
      get: (..._params: unknown[]) => this.query(_sql).get(..._params),
      values: (..._params: unknown[]) => this.query(_sql).values(..._params),
    }
  }

  close() {}
  serialize(): Uint8Array {
    return new Uint8Array()
  }
  loadExtension(_path: string) {}
  transaction(fn: () => void): () => void {
    return fn
  }
}

export function resetMockDb() {
  tables.clear()
}

export { Database }
