import test from "node:test";
import assert from "node:assert/strict";
import { patchVm } from "./helpers/patch-vm.mjs";
import { createProjectRepresentationAdapter } from "../src/project-views.js";

function fixture(buildPreview) {
  const project = {
    targets: [{ isStage: true, blocks: {} }],
    extensionStorage: { source: "value: 1\n" },
  };
  const host = patchVm(project),
    vm = host.vm,
    runtime = vm.runtime;
  const counts = {
    builders: {},
    serializations: 0,
    validations: 0,
    candidates: 0,
  };
  Object.defineProperties(counts, {
    saves: { get: () => host.counts.saves },
    loads: { get: () => host.counts.loads },
  });
  const serialize = vm.toJSON;
  vm.toJSON = () => {
    counts.serializations++;
    return serialize();
  };
  const owner = {
    inspect: () => ({ available: true }),
    capture: () => Object.freeze({ source: project.extensionStorage.source }),
    prepare: async (_snapshot, source) => {
      counts.validations++;
      return { source };
    },
    commit() {
      throw Error("Preview never commits raw source.");
    },
    dispose() {},
  };
  const adapter = createProjectRepresentationAdapter({
    vm,
    adapter: owner,
    reference: { providerId: "owner", documentId: "one" },
    buildCandidate({ project, source }) {
      counts.candidates++;
      project.targets[0].blocks.converted = {
        opcode: "event_whenflagclicked",
        inputs: {},
        fields: {},
        next: null,
        parent: null,
        shadow: false,
        topLevel: true,
      };
      return { project, source, summary: "Explicit conversion" };
    },
    buildPreview: async (input) => {
      counts.builders[input.kind] = (counts.builders[input.kind] ?? 0) + 1;
      assert.equal(input.source, "value: 1\n");
      return buildPreview
        ? buildPreview(input)
        : { kind: input.kind, source: input.source };
    },
  });
  return { adapter, project, runtime, counts };
}
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

test("A-B-A reuses only the normalized frozen model while every hit still validates the full snapshot", async () => {
  const originals = {};
  const f = fixture(
      ({ kind, source }) =>
        (originals[kind] = {
          kind,
          source,
          blocks: {
            one: { opcode: "inert", fields: { TEXT: ["original", null] } },
          },
          rootIds: ["one"],
        }),
    ),
    snapshot = f.adapter.capture();
  const a = await f.adapter.previewRepresentation(snapshot, { kind: "a" });
  await f.adapter.previewRepresentation(snapshot, { kind: "b" });
  const before = f.counts.serializations,
    again = await f.adapter.previewRepresentation(snapshot, { kind: "a" });
  assert.strictEqual(again, a);
  assert.equal(f.counts.serializations, before + 1);
  assert.deepEqual(f.counts.builders, { a: 1, b: 1 });
  assert(Object.isFrozen(a.blocks.one.fields.TEXT));
  assert.throws(() => {
    a.blocks.one.fields.TEXT[0] = "poison";
  }, TypeError);
  originals.a.blocks.one.fields.TEXT[0] = "builder mutated";
  assert.equal(again.blocks.one.fields.TEXT[0], "original");
  f.project.extensionStorage.changed = true;
  await assert.rejects(
    f.adapter.previewRepresentation(snapshot, { kind: "a" }),
    { code: "PROJECT_CONFLICT" },
  );
  assert.deepEqual(f.counts.builders, { a: 1, b: 1 });
  assert.equal(f.counts.saves, 0);
  assert.equal(f.counts.loads, 0);
  assert.equal(f.counts.validations, 0);
  f.adapter.dispose();
});

test("new capture and PROJECT_CHANGED discard models without weakening load/reset/dispose invalidation", async () => {
  const f = fixture();
  let snapshot = f.adapter.capture();
  await f.adapter.previewRepresentation(snapshot, { kind: "a" });
  snapshot = f.adapter.capture();
  await f.adapter.previewRepresentation(snapshot, { kind: "a" });
  assert.equal(f.counts.builders.a, 2);
  f.runtime.emit("PROJECT_CHANGED");
  await f.adapter.previewRepresentation(snapshot, { kind: "a" });
  assert.equal(f.counts.builders.a, 3);
  for (const event of ["PROJECT_LOADED", "RUNTIME_DISPOSED"]) {
    f.runtime.emit(event);
    await assert.rejects(
      f.adapter.previewRepresentation(snapshot, { kind: "a" }),
      { code: "PROJECT_CONFLICT" },
    );
    snapshot = f.adapter.capture();
    await f.adapter.previewRepresentation(snapshot, { kind: "a" });
  }
  assert.equal(f.counts.builders.a, 5);
  f.adapter.dispose();
  await assert.rejects(
    f.adapter.previewRepresentation(snapshot, { kind: "a" }),
    { code: "DOCUMENT_CLOSED" },
  );
  for (const event of ["PROJECT_CHANGED", "PROJECT_LOADED", "RUNTIME_DISPOSED"])
    assert.equal(f.runtime.listenerCount(event), 0);
});

test("same-snapshot in-flight work shares its Promise; errors are retried and never cached", async () => {
  const first = deferred();
  let attempt = 0;
  const f = fixture((input) =>
      ++attempt === 1
        ? first.promise
        : { kind: input.kind, source: input.source },
    ),
    snapshot = f.adapter.capture();
  const a = f.adapter.previewRepresentation(snapshot, { kind: "a" }),
    b = f.adapter.previewRepresentation(snapshot, { kind: "a" });
  assert.strictEqual(a, b);
  assert.equal(attempt, 1);
  first.reject(Error("first failure"));
  await assert.rejects(a, /first failure/);
  await assert.rejects(b, /first failure/);
  await f.adapter.previewRepresentation(snapshot, { kind: "a" });
  await f.adapter.previewRepresentation(snapshot, { kind: "a" });
  assert.equal(attempt, 2);
  f.adapter.dispose();
});

test("old async results cannot populate a cache after a new capture or change notification", async () => {
  for (const mode of ["capture", "changed"]) {
    const old = deferred();
    let attempt = 0;
    const f = fixture((input) =>
        ++attempt === 1
          ? old.promise
          : { kind: input.kind, source: input.source },
      ),
      original = f.adapter.capture();
    const pending = f.adapter.previewRepresentation(original, { kind: "a" });
    if (mode === "capture") f.adapter.capture();
    else f.runtime.emit("PROJECT_CHANGED");
    old.resolve({ kind: "a", source: "value: 1\n" });
    await pending;
    await f.adapter.previewRepresentation(original, { kind: "a" });
    assert.equal(attempt, 2);
    f.adapter.dispose();
  }
});

test("the LRU retains at most three kinds and refreshes order on hits", async () => {
  const f = fixture(),
    snapshot = f.adapter.capture();
  for (const kind of ["a", "b", "c", "a", "d", "a", "b"])
    await f.adapter.previewRepresentation(snapshot, { kind });
  assert.deepEqual(f.counts.builders, { a: 1, b: 2, c: 1, d: 1 });
  f.adapter.dispose();
});

test("the cache evicts least-recently-used models above eight MiB in total", async () => {
  const source = "x".repeat(3 * 1024 * 1024),
    f = fixture(({ kind }) => ({ kind, source })),
    snapshot = f.adapter.capture();
  for (const kind of ["a", "b", "a", "c", "a", "b"])
    await f.adapter.previewRepresentation(snapshot, { kind });
  assert.deepEqual(f.counts.builders, { a: 1, b: 2, c: 1 });
  f.adapter.dispose();
});

test("legacy preview-only builders retain the independently validated Save fallback", async () => {
  const f = fixture(),
    snapshot = f.adapter.capture();
  await f.adapter.previewRepresentation(snapshot, { kind: "a" });
  await f.adapter.previewRepresentation(snapshot, { kind: "a" });
  const candidate = await f.adapter.prepareRepresentation(snapshot, {
    kind: "a",
    direction: "from-source",
  });
  assert.equal(f.counts.candidates, 1);
  assert.equal(f.counts.validations, 1);
  assert.equal(f.counts.saves, 0);
  await f.adapter.commitRepresentation(snapshot, candidate);
  assert.equal(f.counts.validations, 2);
  assert.equal(f.counts.saves, 0);
  assert.equal(f.counts.loads, 0);
  assert.deepEqual(f.counts.builders, { a: 1 });
  f.adapter.dispose();
});
