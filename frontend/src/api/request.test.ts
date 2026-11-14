import assert from "node:assert/strict";
import { afterEach, it } from "node:test";
import { requestJson } from "./request.ts";
import { describeError } from "./errors.ts";
import { apiConnection } from "./connection.ts";
import { parseSitesResponse } from "./validate.ts";

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
  assert.equal(apiConnection.getSnapshot(), "service-error");
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

for (const status of [200, 422, 500, 503]) {
  it(`reports aborted when cancelled while reading a ${status} response body`, async () => {
    const ctrl = new AbortController();
    apiConnection.set("online");
    globalThis.fetch = async () => {
      const res = new Response("{}", { status });
      res.json = async () => { ctrl.abort(); throw new DOMException("cancelled", "AbortError"); };
      return res;
    };
    await assert.rejects(requestJson("/route", undefined, ctrl.signal), (e: unknown) =>
      e instanceof Error && "kind" in e && e.kind === "aborted");
    assert.equal(apiConnection.getSnapshot(), "online");
  });
}

it("does not report live data for an HTML success response", async () => {
  globalThis.fetch = async () => new Response("<html>proxy page</html>");
  await assert.rejects(requestJson("/sites"));
  assert.equal(apiConnection.getSnapshot(), "invalid");
});

it("does not change the badge before a response body finishes", async () => {
  apiConnection.set("offline");
  globalThis.fetch = async () => {
    const res = new Response("{}");
    res.json = async () => { assert.equal(apiConnection.getSnapshot(), "offline"); return {}; };
    return res;
  };
  await requestJson("/sites");
  assert.equal(apiConnection.getSnapshot(), "online");
});

it("only reports online after the endpoint schema has been validated", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ wrong: [] }));
  await assert.rejects(requestJson("/sites", undefined, undefined, parseSitesResponse));
  assert.equal(apiConnection.getSnapshot(), "invalid");
});
