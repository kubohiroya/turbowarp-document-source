import test from "node:test";
import assert from "node:assert/strict";
import {
  createProjectRepresentationAdapter,
  type RepresentationCandidate,
  type RepresentationRequest,
} from "../src/project-views.ts";
import type { SourceDocumentAdapter } from "@kubohiroya/turbowarp-document-data/composition";
import { patchVm } from "./helpers/patch-vm.ts";
const node = () => ({
  opcode: "event_whenflagclicked",
  next: null,
  parent: null,
  inputs: {},
  fields: {},
  shadow: false,
  topLevel: true,
});
function fixture({ shallowFreezeCandidate = false } = {}) {
  const project: Record<string, any> = {
    targets: [
      {
        isStage: true,
        name: "Stage",
        blocks: { old: node() },
        comments: {},
        costumes: [{ name: "retained" }],
      },
    ],
    extensionStorage: {
      owner: { source: "original", assets: { large: "unchanged large data" } },
      other: { retained: true },
    },
  };
  const f = patchVm(project),
    counts = { preview: 0, fallback: 0, validations: 0 },
    bases = new Set(),
    artifacts: RepresentationCandidate[] = [];
  let rejectValidation = false;
  const owner: SourceDocumentAdapter = {
    inspect: () => ({ available: true }),
    capture: () =>
      Object.freeze({ source: project.extensionStorage.owner.source }),
    async prepare(_snapshot, source) {
      counts.validations++;
      if (rejectValidation) throw Error("invalid source");
      return { source };
    },
    commit() {
      throw Error("not raw Save");
    },
    dispose() {},
  };
  const build = (base: Record<string, any>, kind: string) => ({
    ...base,
    targets: base.targets.map((target: Record<string, any>, index: number) =>
      index
        ? target
        : { ...target, blocks: { ...target.blocks, [kind]: node() } },
    ),
    extensionStorage: {
      ...base.extensionStorage,
      owner: { ...base.extensionStorage.owner, source: `converted ${kind}` },
    },
  });
  const adapter = createProjectRepresentationAdapter({
    vm: f.vm,
    adapter: owner,
    reference: { providerId: "owner", documentId: "one" },
    buildPreviewArtifact({ project: base, kind }) {
      counts.preview++;
      bases.add(base);
      assert(Object.isFrozen(base.targets[0].blocks));
      const candidate: RepresentationCandidate & {
        request: RepresentationRequest;
      } = {
        request: {
          kind: kind === "source" ? "schema-blocks" : kind,
          direction: kind === "source" ? "to-source" : "from-source",
        },
        project: build(base, kind),
        source: `converted ${kind}`,
        summary: `candidate ${kind}`,
      };
      assert.strictEqual(
        candidate.project.extensionStorage.owner.assets,
        base.extensionStorage.owner.assets,
      );
      assert.strictEqual(
        candidate.project.targets[0].costumes,
        base.targets[0].costumes,
      );
      if (shallowFreezeCandidate) Object.freeze(candidate.project);
      artifacts.push(candidate);
      return {
        preview: {
          kind,
          source: candidate.source,
          blocks: { shown: node() },
          rootIds: ["shown"],
        },
        candidate,
      };
    },
    buildCandidate({ project, request }) {
      counts.fallback++;
      return {
        project: build(project, request.kind),
        source: `converted ${request.kind}`,
        summary: "fallback",
      };
    },
  });
  return {
    ...f,
    patchCounts: f.counts,
    adapter,
    counts,
    bases,
    artifacts,
    set rejectValidation(value: boolean) {
      rejectValidation = value;
    },
  };
}
test("A-B-A keeps one immutable base and Save applies the validated private artifact without re-conversion, archive or double validation", async () => {
  const f = fixture(),
    snapshot = f.adapter.capture(),
    assets = f.project.extensionStorage.owner.assets,
    target = f.targets[0],
    old = target.blocks.getBlock("old");
  const first = await f.adapter.previewRepresentation!(snapshot, {
    kind: "yaml-blocks",
  });
  await f.adapter.previewRepresentation!(snapshot, { kind: "schema-blocks" });
  assert.strictEqual(
    await f.adapter.previewRepresentation!(snapshot, { kind: "yaml-blocks" }),
    first,
  );
  assert.equal(f.counts.preview, 2);
  assert.equal(f.counts.validations, 2);
  assert.equal(f.bases.size, 1);
  assert.equal("candidate" in first, false);
  assert.equal("project" in first, false);
  assert.throws(() => {
    f.artifacts[0].project.targets[0].blocks.poison = node();
  }, TypeError);
  assert.equal(Object.isFrozen(assets), false);
  const candidate = await f.adapter.prepareRepresentation(snapshot, {
    kind: "yaml-blocks",
    direction: "from-source",
  });
  assert.equal(f.counts.fallback, 0);
  assert.equal(f.counts.preview, 2);
  assert.equal(f.counts.validations, 2);
  await f.adapter.commitRepresentation(snapshot, candidate);
  assert.equal(f.counts.validations, 2);
  assert.equal(
    f.project.extensionStorage.owner.source,
    "converted yaml-blocks",
  );
  assert.strictEqual(f.project.extensionStorage.owner.assets, assets);
  assert.strictEqual(f.targets[0], target);
  assert.strictEqual(target.blocks.getBlock("old"), old);
  assert(f.artifacts[0].project);
  assert.equal(f.vm.runtime.targets.length, 1);
  assert.equal(f.patchCounts.stops, 0);
  assert.equal(f.patchCounts.saves, 0);
  assert.equal(f.patchCounts.loads, 0);
  f.adapter.dispose();
});
test("source preview matches its active-kind to-source request without leaking the artifact publicly", async () => {
  const f = fixture(),
    snapshot = f.adapter.capture();
  await f.adapter.previewRepresentation!(snapshot, { kind: "source" });
  const candidate = await f.adapter.prepareRepresentation(snapshot, {
    kind: "schema-blocks",
    direction: "to-source",
  });
  assert.equal(f.counts.fallback, 0);
  assert.equal(candidate.source, "converted source");
  f.adapter.dispose();
});
test("real changes reject cached Save and capture/change notifications discard the artifact and parsed context", async () => {
  const f = fixture();
  let snapshot = f.adapter.capture();
  await f.adapter.previewRepresentation!(snapshot, { kind: "yaml-blocks" });
  f.project.extensionStorage.other.retained = false;
  await assert.rejects(
    f.adapter.prepareRepresentation(snapshot, {
      kind: "yaml-blocks",
      direction: "from-source",
    }),
    { code: "PROJECT_CONFLICT" },
  );
  assert.equal(f.counts.fallback, 0);
  f.project.extensionStorage.other.retained = true;
  f.vm.runtime.emit("PROJECT_CHANGED");
  await f.adapter.prepareRepresentation(snapshot, {
    kind: "yaml-blocks",
    direction: "from-source",
  });
  assert.equal(f.counts.fallback, 1);
  snapshot = f.adapter.capture();
  await f.adapter.previewRepresentation!(snapshot, { kind: "yaml-blocks" });
  assert.equal(f.bases.size, 2);
  f.adapter.dispose();
});
test("failed artifact validation is not cached and can be retried from the same immutable base", async () => {
  const f = fixture(),
    snapshot = f.adapter.capture();
  // TypeScript drops a setter-only accessor's write type next to a spread.
  (f as unknown as { rejectValidation: boolean }).rejectValidation = true;
  await assert.rejects(
    f.adapter.previewRepresentation!(snapshot, { kind: "yaml-blocks" }),
    /invalid source/,
  );
  (f as unknown as { rejectValidation: boolean }).rejectValidation = false;
  await f.adapter.previewRepresentation!(snapshot, { kind: "yaml-blocks" });
  await f.adapter.previewRepresentation!(snapshot, { kind: "yaml-blocks" });
  assert.equal(f.counts.preview, 2);
  assert.equal(f.counts.validations, 2);
  assert.equal(f.bases.size, 1);
  f.adapter.dispose();
});

test("a mismatched preview and private Save source is rejected without validation or cache pollution", async () => {
  const f = patchVm({
    targets: [{ isStage: true, name: "Stage", blocks: {}, comments: {} }],
    extensionStorage: { owner: { source: "raw" } },
  });
  let calls = 0,
    validations = 0;
  const adapter = createProjectRepresentationAdapter({
    vm: f.vm,
    adapter: {
      capture: () => Object.freeze({ source: "raw" }),
      inspect: () => ({ available: true }),
      prepare: () => {
        validations++;
      },
      commit() {},
      dispose() {},
      // prepare and commit must never run here, so they return nothing.
    } as unknown as SourceDocumentAdapter,
    reference: { providerId: "owner", documentId: "one" },
    buildCandidate() {
      throw Error("unused");
    },
    buildPreviewArtifact({ project, kind }) {
      calls++;
      return {
        preview: { kind, source: "shown" },
        candidate: {
          request: { kind, direction: "from-source" },
          project,
          source: "different",
          summary: "mismatch",
        },
      };
    },
  });
  const snapshot = adapter.capture();
  await assert.rejects(
    adapter.previewRepresentation!(snapshot, { kind: "yaml-blocks" }),
    { code: "REPRESENTATION_INVALID" },
  );
  await assert.rejects(
    adapter.previewRepresentation!(snapshot, { kind: "yaml-blocks" }),
    { code: "REPRESENTATION_INVALID" },
  );
  assert.equal(calls, 2);
  assert.equal(validations, 0);
  assert.equal(f.counts.changes, 0);
  adapter.dispose();
});

test("an owner shallow-frozen candidate still receives deeply immutable changed descendants", async () => {
  const f = fixture({ shallowFreezeCandidate: true }),
    snapshot = f.adapter.capture();
  await f.adapter.previewRepresentation!(snapshot, { kind: "yaml-blocks" });
  const candidate = f.artifacts[0].project;
  assert(Object.isFrozen(candidate));
  assert(Object.isFrozen(candidate.targets[0].blocks));
  assert.throws(() => {
    candidate.targets[0].blocks["yaml-blocks"].opcode = "poison";
  }, TypeError);
  const prepared = await f.adapter.prepareRepresentation(snapshot, {
    kind: "yaml-blocks",
    direction: "from-source",
  });
  await f.adapter.commitRepresentation(snapshot, prepared);
  assert.equal(
    f.targets[0].blocks.getBlock("yaml-blocks")!.opcode,
    "event_whenflagclicked",
  );
  assert.equal(
    f.patchCounts.stops + f.patchCounts.saves + f.patchCounts.loads,
    0,
  );
  f.adapter.dispose();
});
