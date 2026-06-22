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

export class Database {
  constructor(_dbPath: string, _opts?: { create?: boolean }) {}

  run(sql: string): { changes: number; lastInsertRowid: number } {
    const createMatch = sql.match(/create\s+table\s+(?:if\s+not\s+exists\s+)?(\w+)/i)
    if (createMatch) {
      ensureTable(createMatch[1])
    }
    return { changes: 0, lastInsertRowid: 0 }
  }

  prepare(_sql: string) {
    return {
      run: (..._params: unknown[]) => ({ changes: 0, lastInsertRowid: 0 }),
      all: () => [] as Row[],
      get: () => undefined as Row | undefined,
    }
  }

  query(_sql: string) {
    return {
      all: () => [] as Row[],
      get: (..._params: unknown[]) => undefined as Row | undefined,
    }
  }

  transaction(fn: () => void): () => void {
    return fn
  }
}

export function resetMockDb(): void {
  tables.clear()
}
