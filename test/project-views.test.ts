import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createProjectRepresentationAdapter,
  installProjectPatchWorkspaceAdapter,
} from "../src/project-views.ts";
import type {
  SourceDocumentAdapter,
  SourceDocumentSnapshot,
} from "@kubohiroya/turbowarp-document-data/composition";
import { patchVm } from "./helpers/patch-vm.ts";
const block = () => ({
  opcode: "event_whenflagclicked",
  next: null,
  parent: null,
  inputs: {},
  fields: {},
  shadow: false,
  topLevel: true,
  x: 20,
  y: 30,
});
function fixture() {
  const initial = {
    targets: [
      {
        isStage: true,
        name: "舞台🌏",
        blocks: { original: block(), untouched: block() },
        comments: {},
        costumes: [{ name: "retained", assetId: "image" }],
        sounds: [{ name: "sound" }],
        variables: { broadcast: ["unchanged", 0] },
      },
    ],
    extensionStorage: {
      document: {
        source: "# 日本語コメント📝\r\nvolume: 50\r\n",
        assets: { payload: "large asset" },
      },
      other: { retained: true },
    },
  };
  const f = patchVm(structuredClone(initial)),
    records = new WeakMap<SourceDocumentSnapshot, string>();
  let ownerPrepares = 0;
  const owner: SourceDocumentAdapter = {
    inspect: () => ({ available: true }),
    capture() {
      const snapshot = Object.freeze({
        source: f.project.extensionStorage.document.source,
      });
      records.set(snapshot, f.vm.toJSON());
      return snapshot;
    },
    async prepare(snapshot, source) {
      ownerPrepares++;
      if (records.get(snapshot) !== f.vm.toJSON()) throw Error("owner stale");
      return { source };
    },
    async commit() {
      throw Error("Representation must not call raw commit.");
    },
    dispose() {},
  };
  const adapter = createProjectRepresentationAdapter({
    vm: f.vm,
    adapter: owner,
    reference: { providerId: "test", documentId: "one" },
    buildCandidate({ project, source }) {
      project.targets[0].blocks.original = { ...block(), x: 80 };
      project.targets[0].blocks.view = block();
      project.extensionStorage.document.source = source + "# edited\r\n";
      return {
        project,
        source: project.extensionStorage.document.source,
        summary: "Show YAML blocks",
      };
    },
  });
  return {
    ...f,
    adapter,
    initial,
    get ownerPrepares() {
      return ownerPrepares;
    },
  };
}
test("explicit apply patches changed blocks and metadata without stop, ZIP, target replacement or asset identity changes", async () => {
  const f = fixture(),
    target = f.targets[0],
    untouched = target.blocks.getBlock("untouched"),
    assets = f.vm.runtime.extensionStorage.document.assets,
    costumes = target.sprite.costumes,
    sounds = target.sprite.sounds,
    variables = target.variables;
  const s = f.adapter.capture(),
    before = f.vm.toJSON(),
    candidate = await f.adapter.prepareRepresentation(s, {
      kind: "yaml-blocks",
      direction: "from-source",
    });
  assert.equal(f.vm.toJSON(), before);
  assert.equal(f.counts.changes, 0);
  assert.equal(
    (await f.adapter.commitRepresentation(s, candidate)).projectPatched,
    true,
  );
  assert.strictEqual(f.vm.runtime.targets[0], target);
  assert.strictEqual(target.blocks.getBlock("untouched"), untouched);
  assert.strictEqual(f.vm.runtime.extensionStorage.document.assets, assets);
  assert.strictEqual(target.sprite.costumes, costumes);
  assert.strictEqual(target.sprite.sounds, sounds);
  assert.strictEqual(target.variables, variables);
  assert.equal(target.blocks.getBlock("original")!.x, 80);
  assert(target.blocks.getBlock("view"));
  assert(
    f.vm.runtime.extensionStorage.document.source.endsWith("# edited\r\n"),
  );
  assert.equal(f.counts.saves, 0);
  assert.equal(f.counts.loads, 0);
  assert.equal(f.counts.stops, 0);
  assert.equal(f.counts.changes, 1);
  assert.equal(f.ownerPrepares, 2);
  await assert.rejects(f.adapter.commitRepresentation(s, candidate), {
    code: "REPRESENTATION_INVALID",
  });
  f.adapter.dispose();
});
test("stale and forged candidates never mutate blocks, data or running scripts", async () => {
  const f = fixture(),
    s = f.adapter.capture(),
    candidate = await f.adapter.prepareRepresentation(s, {
      kind: "yaml-blocks",
      direction: "from-source",
    });
  await assert.rejects(f.adapter.commitRepresentation(s, { ...candidate }), {
    code: "REPRESENTATION_INVALID",
  });
  f.project.extensionStorage.other.retained = false;
  const edited = f.vm.toJSON();
  await assert.rejects(f.adapter.commitRepresentation(s, candidate), {
    code: "PROJECT_CONFLICT",
  });
  assert.equal(f.vm.toJSON(), edited);
  assert.equal(f.counts.changes, 0);
  assert.equal(f.counts.stops, 0);
  f.adapter.dispose();
});
test("failed synchronous UI mutation restores original blocks, storage leaves and object identities", async () => {
  const f = fixture(),
    before = f.vm.toJSON(),
    original = f.targets[0].blocks.getBlock("original"),
    assets = f.vm.runtime.extensionStorage.document.assets;
  let rolledBack = 0;
  installProjectPatchWorkspaceAdapter(f.vm, {
    prepare() {
      return {
        apply() {
          throw Error("UI rejected patch");
        },
        rollback() {
          rolledBack++;
        },
      };
    },
  });
  const s = f.adapter.capture(),
    candidate = await f.adapter.prepareRepresentation(s, {
      kind: "yaml-blocks",
      direction: "from-source",
    });
  await assert.rejects(
    f.adapter.commitRepresentation(s, candidate),
    (error: Error & { code?: string; rollbackSucceeded?: boolean }) =>
      error.code === "REPRESENTATION_APPLY_FAILED" &&
      error.rollbackSucceeded === true,
  );
  assert.deepEqual(JSON.parse(f.vm.toJSON()), JSON.parse(before));
  assert.strictEqual(f.targets[0].blocks.getBlock("original"), original);
  assert.strictEqual(f.vm.runtime.extensionStorage.document.assets, assets);
  assert.equal(rolledBack, 1);
  assert.equal(f.counts.changes, 0);
  assert.equal(f.counts.saves, 0);
  assert.equal(f.counts.loads, 0);
  f.adapter.dispose();
});
