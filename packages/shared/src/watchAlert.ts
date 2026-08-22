import type { WatchAlert, ProwlarrResult } from "./schemas";

export function alertToProwlarrResult(alert: WatchAlert): ProwlarrResult {
  return {
    title: alert.title,
    guid: alert.guid,
    magnetUrl: alert.magnetUrl,
    downloadUrl: alert.downloadUrl,
    size: alert.size,
    seeders: alert.seeders,
    indexer: alert.indexer,
    categories: [],
    publishDate: null,
  };
}
