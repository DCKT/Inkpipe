import { Database, resetMockDb } from "../__mocks__/bun-sqlite"

export { resetMockDb }

export function createMockDb(): { db: any } {
  const db = new Database("/test")
  return { db }
}
