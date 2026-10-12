// The setPersonalization confirm card must not read as saved before the write
// has answered. Pins the CodeRabbit finding on #4256: the console's
// writePersonalization() fired the POST and returned nothing, so the card went
// to "done" while the request was still in flight, and a 409 (the file left
// untouched on purpose) arrived as a stray note after the card had already
// reported success.
//
// Run (from web/, as `npm test` does):  node --test tests/lib/personalization-confirm.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import "../helpers/web-ts-alias-loader.mjs";

const { dispatch } = await import("../../src/app/actions/registry.ts");
const { cleanMessages } = await import("../../src/lib/assistant-history.mjs");

const PAYLOAD = { exitNarrative: "Moving from consulting to product." };

function ctxWith(writePersonalization) {
  return {
    push() {}, replace() {}, startJob() { return null; }, inbox: [], applications: [], jobForUrl() {},
    rememberFact() {}, writeStatus() {}, setApplyField() {}, startApply() {}, writePersonalization,
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

test("the confirmed run settles only after the personalization write has answered", async () => {
  const write = deferred();
  const calls = [];
  const res = dispatch("setPersonalization", PAYLOAD, ctxWith((patch) => { calls.push(patch); return write.promise; }));
  assert.equal(res.status, "confirm");
  assert.equal(calls.length, 0, "nothing is written before the user confirms");

  let settled = false;
  const run = res.run();
  assert.ok(run instanceof Promise, "the card needs a promise to wait on");
  run.then(() => { settled = true; }, () => {});
  await new Promise((r) => setImmediate(r));
  assert.deepEqual({ calls, settled }, { calls: [PAYLOAD], settled: false });

  write.resolve();
  assert.deepEqual(await run, { note: "Personalization saved — evaluations now score against YOUR targeting." });
});

test("a refused write rejects the run instead of reporting it saved", async () => {
  const refused = new Error("modes/_profile.md was left untouched: a code fence is never closed");
  const res = dispatch("setPersonalization", PAYLOAD, ctxWith(() => Promise.reject(refused)));
  await assert.rejects(res.run(), refused);
});

test("stored history drops a save still in flight and keeps a failed one as failed", () => {
  const cleaned = cleanMessages([{ role: "assistant", parts: [
    { type: "confirm", state: "saving", cid: "c1", summary: "Save your personalization? (exit narrative)" },
    { type: "confirm", state: "failed", cid: "c2", summary: "Save your personalization? (comp targets)" },
  ] }]);
  assert.deepEqual(cleaned[0].parts, [{ type: "note", text: "Save your personalization? (comp targets) (failed)" }]);
});

// The console is a React component: read its source for the two wiring points
// the behaviour above depends on, as config-form-persist-wiring.test.mjs does.
const src = readFileSync(new URL("../../src/components/assistant-console.tsx", import.meta.url), "utf8");
function between(start, end) {
  const i = src.indexOf(start);
  const j = i === -1 ? -1 : src.indexOf(end, i + start.length);
  assert.ok(i !== -1 && j !== -1, `could not locate ${start} in assistant-console.tsx`);
  return src.slice(i, j);
}

test("the console's writePersonalization hands a failure to the card instead of swallowing it", () => {
  const body = between("writePersonalization: async (patch) =>", "\n      },\n");
  assert.match(body, /await fetch\("\/api\/personalization"/);
  assert.match(body, /if \(!r\.ok\) throw/);
  assert.doesNotMatch(body, /appendParts|\.catch\(\s*\(?e\b/, "a caught rejection would let the card report success");
});

test("a confirm whose run returns a promise reads as done only when it resolves", () => {
  const body = between("function resolveConfirm(", "function settleConfirm(");
  assert.match(body, /settleConfirm\(cid, "saving", null\);\s*result\.then\(/);
  assert.match(body, /\(info\) => settleConfirm\(cid, "done", info/);
  assert.match(body, /\(e\) => settleConfirm\(cid, "failed"/);
});
