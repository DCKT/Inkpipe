import { describe, expect, it } from "vitest";
import { alertToProwlarrResult } from "./watchAlert";
import { WatchAlertId, WatchId } from "./schemas";

describe("alertToProwlarrResult", () => {
  it("maps a WatchAlert to a ProwlarrResult", () => {
    const alert = {
      id: WatchAlertId.make(1),
      watchId: WatchId.make(2),
      guid: "guid-1",
      title: "One Piece v01",
      magnetUrl: "magnet:?xt=urn:btih:abc",
      downloadUrl: null,
      size: 1024,
      seeders: 5,
      indexer: "Nyaa",
      matchedAt: 1700000000000,
      acknowledged: false,
    };

    expect(alertToProwlarrResult(alert)).toEqual({
      title: "One Piece v01",
      guid: "guid-1",
      magnetUrl: "magnet:?xt=urn:btih:abc",
      downloadUrl: null,
      size: 1024,
      seeders: 5,
      indexer: "Nyaa",
      categories: [],
      publishDate: null,
    });
  });

  it("passes through a null magnetUrl", () => {
    const alert = {
      id: WatchAlertId.make(1),
      watchId: WatchId.make(2),
      guid: "guid-1",
      title: "t",
      magnetUrl: null,
      downloadUrl: null,
      size: 0,
      seeders: 0,
      indexer: "x",
      matchedAt: 0,
      acknowledged: false,
    };

    expect(alertToProwlarrResult(alert).magnetUrl).toBeNull();
  });

  it("passes through the alert's downloadUrl for indexers that only provide a torrent-file link", () => {
    const alert = {
      id: WatchAlertId.make(1),
      watchId: WatchId.make(2),
      guid: "guid-1",
      title: "t",
      magnetUrl: null,
      downloadUrl: "https://indexer.example.com/download/abc.torrent",
      size: 0,
      seeders: 0,
      indexer: "x",
      matchedAt: 0,
      acknowledged: false,
    };

    expect(alertToProwlarrResult(alert).downloadUrl).toBe(
      "https://indexer.example.com/download/abc.torrent",
    );
  });
});
