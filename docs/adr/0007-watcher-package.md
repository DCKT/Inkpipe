# Watcher as standalone package

The Watch scheduler runs as a standalone Bun process (`packages/watcher`) separate from the server. It connects to the same SQLite database (`~/.inkpipe/inkpipe.db`) and uses SQLite WAL mode for safe concurrent access.

This decouples the scheduler from the HTTP server: if the watcher crashes, the server continues serving API requests and the web UI. The shared SQLite database enables both processes to read/write watches and alerts without coordination.

**Rejected alternative:** Embedding the scheduler inside the server process. While simpler to implement, a scheduler crash (e.g., Prowlarr timeout) would take down the entire HTTP server.

**Consequences:** Two processes share one database. SQLite WAL mode prevents read contention. Both processes create the same tables with `CREATE TABLE IF NOT EXISTS` on startup — no separate migration tooling needed. Web push subscriptions are stored on the filesystem (`~/.inkpipe/push_subscriptions.json`) rather than SQLite so both server (subscription management) and watcher (sending) can access them without contention.
