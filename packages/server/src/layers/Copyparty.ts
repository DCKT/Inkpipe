import { Effect, Layer } from "effect";
import {
  CopypartyNotConfigured,
  CopypartyHttpError,
  CopypartyFolderError,
} from "@inkpipe/shared";
import { ConfigService } from "./Config";
import { LogService } from "./Log";

export class CopypartyService extends Effect.Tag("CopypartyService")<
  CopypartyService,
  {
    readonly listFolders: Effect.Effect<
      string[],
      CopypartyNotConfigured | CopypartyHttpError
    >;
    readonly uploadFile: (
      filePath: string,
      subfolder?: string,
    ) => Effect.Effect<void, CopypartyNotConfigured | CopypartyHttpError>;
    readonly createFolder: (
      folderName: string,
    ) => Effect.Effect<
      void,
      CopypartyNotConfigured | CopypartyHttpError | CopypartyFolderError
    >;
    readonly deleteFolder: (
      folderName: string,
    ) => Effect.Effect<
      void,
      CopypartyNotConfigured | CopypartyHttpError | CopypartyFolderError
    >;
  }
>() {}

export const CopypartyServiceLive = Layer.effect(
  CopypartyService,
  Effect.gen(function* () {
    const configService = yield* ConfigService;
    const log = yield* LogService;

    const listFolders = Effect.gen(function* () {
      const configOpt = yield* configService.loadConfig.pipe(
        Effect.catchAll(() => Effect.succeed(undefined)),
      );
      if (!configOpt) return [];
      const { url, uploadPath, password } = configOpt.copyparty;
      if (!url) return [];

      const base = url.replace(/\/+$/, "");
      const path = uploadPath.replace(/^\/+|\/+$/g, "");
      const listUrl = path ? `${base}/${path}/` : `${base}/`;

      return yield* Effect.tryPromise({
        try: async () => {
          const params = new URLSearchParams({ ls: "" });
          if (password) params.set("pw", password);
          const fetchUrl = `${listUrl}?${params.toString()}`;
          const response = await fetch(fetchUrl, {
            signal: AbortSignal.timeout(10000),
          });
          const data = (await response.json()) as { dirs?: unknown[] };
          if (data?.dirs && Array.isArray(data.dirs)) {
            return data.dirs
              .map((d) => {
                if (Array.isArray(d)) return String(d[0]).replace(/\/+$/, "");
                if (d && typeof d === "object" && "href" in d)
                  return String((d as { href: string }).href).replace(
                    /\/+$/,
                    "",
                  );
                return null;
              })
              .filter(
                (name): name is string =>
                  typeof name === "string" && name.length > 0,
              );
          }
          return [];
        },
        catch: (e) => new CopypartyHttpError({ message: String(e) }),
      });
    });

    const uploadFile = (filePath: string, subfolder?: string) =>
      Effect.gen(function* () {
        const config = yield* configService.loadConfig.pipe(
          Effect.catchAll((e) =>
            Effect.fail(new CopypartyNotConfigured({ message: e.message })),
          ),
        );
        const { url, uploadPath, password } = config.copyparty;
        if (!url) {
          return yield* Effect.fail(
            new CopypartyNotConfigured({
              message: "Copyparty URL not configured",
            }),
          );
        }

        yield* Effect.tryPromise({
          try: async () => {
            const { basename } = await import("node:path");
            const filename = basename(filePath);
            const fileBuf = await Bun.file(filePath).arrayBuffer();

            const base = url.replace(/\/+$/, "");
            const path = uploadPath.replace(/^\/+|\/+$/g, "");
            const sub = subfolder ? subfolder.replace(/^\/+|\/+$/g, "") : "";
            const segments = [path, sub].filter(Boolean).join("/");
            const uploadUrl = `${base}/${segments}/${encodeURIComponent(filename)}`;

            const sp = new URLSearchParams();
            if (password) sp.set("pw", password);
            const finalUrl = sp.toString()
              ? `${uploadUrl}?${sp.toString()}`
              : uploadUrl;

            Effect.runSync(
              log.info("copyparty", `Uploading ${filename} (${fileBuf.byteLength} bytes) to ${uploadUrl}`),
            );
            const response = await fetch(finalUrl, {
              method: "PUT",
              body: new Uint8Array(fileBuf),
              signal: AbortSignal.timeout(300000),
            });
            Effect.runSync(log.info("copyparty", "Upload response status:", response.status));
            const text = await response.text();
            Effect.runSync(log.info("copyparty", "Upload response:", text));
            if (!response.ok) {
              throw new Error(
                `Copyparty upload failed: HTTP ${response.status} — ${text}`,
              );
            }
          },
          catch: (e) => {
            const message = e instanceof Error ? e.message : String(e);
            return new CopypartyHttpError({ message });
          },
        });
      });

    const createFolder = (folderName: string) =>
      Effect.gen(function* () {
        const config = yield* configService.loadConfig.pipe(
          Effect.catchAll((e) =>
            Effect.fail(new CopypartyNotConfigured({ message: e.message })),
          ),
        );
        const { url, uploadPath, password } = config.copyparty;
        if (!url) {
          return yield* Effect.fail(
            new CopypartyNotConfigured({
              message: "Copyparty URL not configured",
            }),
          );
        }

        const sanitized = folderName.replace(/^\/+|\/+$/g, "");
        if (!sanitized) {
          return yield* Effect.fail(
            new CopypartyFolderError({
              message: "Folder name is empty after sanitization",
            }),
          );
        }

        yield* Effect.tryPromise({
          try: async () => {
            const base = url.replace(/\/+$/, "");
            const path = uploadPath.replace(/^\/+|\/+$/g, "");
            const parentUrl = path ? `${base}/${path}/` : `${base}/`;

            const sp = new URLSearchParams();
            if (password) sp.set("pw", password);
            const fetchUrl = sp.toString()
              ? `${parentUrl}?${sp.toString()}`
              : parentUrl;

            const body = new FormData();
            body.append("act", "mkdir");
            body.append("name", sanitized);

            Effect.runSync(
              log.info("copyparty", `Creating folder ${sanitized} at ${fetchUrl}`),
            );
            const response = await fetch(fetchUrl, {
              method: "POST",
              body,
              signal: AbortSignal.timeout(10000),
            });
            const text = await response.text();
            Effect.runSync(
              log.info("copyparty", "Create folder response:", response.status, text),
            );
            if (!response.ok) {
              throw new Error(
                `Copyparty mkdir failed: HTTP ${response.status} — ${text}`,
              );
            }

            const scanParams = new URLSearchParams({ scan: "" });
            if (password) scanParams.set("pw", password);
            const scanUrl = `${parentUrl}?${scanParams.toString()}`;
            Effect.runSync(log.info("copyparty", `Scanning after mkdir: ${scanUrl}`));
            await fetch(scanUrl, {
              signal: AbortSignal.timeout(10000),
            });
          },
          catch: (e) => {
            const message = e instanceof Error ? e.message : String(e);
            return new CopypartyHttpError({ message });
          },
        });
      });

    const deleteFolder = (folderName: string) =>
      Effect.gen(function* () {
        const config = yield* configService.loadConfig.pipe(
          Effect.catchAll((e) =>
            Effect.fail(new CopypartyNotConfigured({ message: e.message })),
          ),
        );
        const { url, uploadPath, password } = config.copyparty;
        if (!url) {
          return yield* Effect.fail(
            new CopypartyNotConfigured({
              message: "Copyparty URL not configured",
            }),
          );
        }

        const sanitized = folderName.replace(/^\/+|\/+$/g, "");
        if (!sanitized) {
          return yield* Effect.fail(
            new CopypartyFolderError({
              message: "Folder name is empty after sanitization",
            }),
          );
        }

        yield* Effect.tryPromise({
          try: async () => {
            const base = url.replace(/\/+$/, "");
            const path = uploadPath.replace(/^\/+|\/+$/g, "");
            const segments = [path, sanitized].filter(Boolean).join("/");
            const folderUrl = `${base}/${segments}/`;

            const sp = new URLSearchParams();
            sp.set("delete", "");
            if (password) sp.set("pw", password);
            const fetchUrl = `${folderUrl}?${sp.toString()}`;

            Effect.runSync(log.info("copyparty", `Deleting folder ${folderUrl}`));
            const response = await fetch(fetchUrl, {
              method: "POST",
              signal: AbortSignal.timeout(10000),
            });
            const text = await response.text();
            Effect.runSync(
              log.info("copyparty", "Delete folder response:", response.status, text),
            );
            if (!response.ok) {
              throw new Error(
                `Copyparty delete failed: HTTP ${response.status} — ${text}`,
              );
            }
          },
          catch: (e) => {
            const message = e instanceof Error ? e.message : String(e);
            return new CopypartyHttpError({ message });
          },
        });
      });

    return { listFolders, uploadFile, createFolder, deleteFolder };
  }),
);
