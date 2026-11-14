import assert from "node:assert/strict";
import { afterEach, it } from "node:test";
import { requestJson } from "./request.ts";
import { describeError } from "./errors.ts";
import { apiConnection } from "./connection.ts";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

it("shows the string detail of a rejected terrain point", async () => {
  const detail = "Point 'start' exceeds the 15 degree slope limit.";
  globalThis.fetch = async () => new Response(JSON.stringify({ detail }), { status: 422 });
  await assert.rejects(requestJson("/route"), (e) => describeError(e) === detail);
  assert.equal(apiConnection.getSnapshot(), "online");
});

it("keeps validation arrays and malformed error bodies out of the message", async () => {
  for (const body of [JSON.stringify({ detail: [{ msg: "internal" }] }), "not json", JSON.stringify({ detail: " " })]) {
    globalThis.fetch = async () => new Response(body, { status: 422 });
    await assert.rejects(requestJson("/route"), (e) => describeError(e).includes("rejected these points"));
  }
});

it("updates connection state after failure and recovery; 422 is reachable", async () => {
  globalThis.fetch = async () => { throw new TypeError("offline"); };
  await assert.rejects(requestJson("/layers"));
  assert.equal(apiConnection.getSnapshot(), "offline");
  globalThis.fetch = async () => new Response("{}", { status: 503 });
  await assert.rejects(requestJson("/sites"));
  assert.equal(apiConnection.getSnapshot(), "offline");
  globalThis.fetch = async () => new Response("{}");
  await requestJson("/sites");
  assert.equal(apiConnection.getSnapshot(), "online");
});

it("does not mark an API offline for a caller cancellation", async () => {
  globalThis.fetch = async () => new Response("{}");
  await requestJson("/sites");
  const ctrl = new AbortController();
  ctrl.abort();
  globalThis.fetch = async (_url, init) => { init?.signal?.throwIfAborted(); return new Response("{}"); };
  await assert.rejects(requestJson("/sites", undefined, ctrl.signal));
  assert.equal(apiConnection.getSnapshot(), "online");
});
