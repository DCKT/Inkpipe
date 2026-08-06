if (typeof globalThis.Bun === "undefined") {
  ;(globalThis as { Bun?: unknown }).Bun = {
    file: (_path: string) => ({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    }),
    write: (_path: string, _data: unknown) => Promise.resolve(0),
  }
}
