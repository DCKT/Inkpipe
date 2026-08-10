// Exercises the real JobsGroupLive handler (not a reimplementation) through
// the real HTTP mechanics, against a mocked JobStoreService — verifying the
// `{jobs}` response shape (see JobStore/JobsDrawer.tsx fix this session) and
// that clearing completed jobs re-broadcasts the fresh job list.
import { Effect, Layer } from "effect"
import { describe, it, expect, afterEach } from "@effect/vitest"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"
import { HttpRouter } from "effect/unstable/http"
import * as BunHttpServer from "@effect/platform-bun/BunHttpServer"
import type { Job } from "@inkpipe/shared"
import { JobId } from "@inkpipe/shared"
import { JobStoreService } from "../layers/storage/JobStore"
import { JobsGroup } from "@inkpipe/shared/httpApi/groups/jobs"
import { JobsGroupLive } from "./handlers/jobs"
import { SchemaErrorMiddleware, SchemaErrorMiddlewareLive } from "@inkpipe/shared"
import { subscribeJobListEvents } from "../lib/jobEvents"

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: JobId.make(1),
    title: "Book",
    stage: "DONE",
    progress: 100,
    startedAt: Date.now(),
    createdAt: "",
    updatedAt: "",
    ...overrides,
  }
}

type JobStoreShape = typeof JobStoreService.Service

function makeStore(overrides: Partial<JobStoreShape> = {}) {
  return Layer.succeed(JobStoreService, {
    createJob: () => Effect.succeed(makeJob()),
    updateJob: () => Effect.void,
    getJob: () => Effect.succeed(undefined as any),
    getAllJobs: Effect.succeed([makeJob()]),
    deleteCompletedJobs: Effect.succeed(1),
    ...overrides,
  })
}

const TestApi = HttpApi.make("test").add(JobsGroup).middleware(SchemaErrorMiddleware)

function makeHandler(store = makeStore()) {
  // JobsGroupLive's static type is tied to the production InkpipeApi's
  // identifier ("InkpipeApi"), while TestApi's is "test" — but HttpApiGroup's
  // runtime context key is derived purely from the group *identifier*
  // ("jobs"), not the parent api's identifier (confirmed in HttpApiGroup.js:
  // `key = \`effect/httpapi/HttpApiGroup/${identifier}\``), so this resolves
  // correctly at runtime (proven by every test below hitting real handler
  // code) despite the type checker treating them as distinct services.
  const JobsGroupWithDeps: any = JobsGroupLive.pipe(
    Layer.provide(SchemaErrorMiddlewareLive),
    Layer.provide(store),
  )
  const ApiLive = HttpApiBuilder.layer(TestApi).pipe(Layer.provide(JobsGroupWithDeps))
  const AppLayer: any = ApiLive.pipe(Layer.provide(BunHttpServer.layerHttpServices))
  const { handler } = HttpRouter.toWebHandler(AppLayer)
  return { handler: handler as (request: Request) => Promise<Response> }
}

const unsubscribes: Array<() => void> = []
afterEach(() => {
  while (unsubscribes.length > 0) unsubscribes.pop()!()
})

describe("jobs API", () => {
  it("GET /api/jobs returns { jobs: [...] }, not a bare array", async () => {
    const { handler } = makeHandler()
    const res = await handler(new Request("http://localhost/api/jobs"))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { jobs: Job[] }
    expect(body).toHaveProperty("jobs")
    expect(Array.isArray(body.jobs)).toBe(true)
    expect(body.jobs[0].title).toBe("Book")
  })

  it("DELETE /api/jobs returns { deleted } and re-broadcasts the post-clear job list", async () => {
    const broadcasts: Job[][] = []
    unsubscribes.push(subscribeJobListEvents((jobs) => broadcasts.push(jobs)))

    const remainingJobs = [makeJob({ id: JobId.make(2), stage: "UPLOADING" })]
    const { handler } = makeHandler(
      makeStore({ deleteCompletedJobs: Effect.succeed(3), getAllJobs: Effect.succeed(remainingJobs) }),
    )

    const res = await handler(new Request("http://localhost/api/jobs", { method: "DELETE" }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ deleted: 3 })

    expect(broadcasts).toEqual([remainingJobs])
  })
})
