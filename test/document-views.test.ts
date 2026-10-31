import { patchVm, type PatchVmBlock } from "./helpers/patch-vm.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { createEmbeddedDocumentProvider } from "../src/document-views.ts";
import { createSourceDocumentStore } from "@kubohiroya/turbowarp-document-data/source-documents";
import {
  createSourceDocumentRegistry,
  type SourceDocumentAdapter,
  type SourceDocumentRepresentationRequest,
  type SourceDocumentSnapshot,
} from "@kubohiroya/turbowarp-document-data/composition";
import { encodeReference } from "../src/reference.ts";
import { readDocumentViewMetadata } from "../src/view-metadata.ts";
import type { RepresentationCandidate } from "../src/project-views.ts";
import type { YamlViewDescriptor } from "../src/yaml-blocks.ts";
// Adapters of an enabled provider implement every representation method, and
// their candidates carry the converted source.
type RepresentationAdapter = Omit<
  Required<SourceDocumentAdapter>,
  "prepareRepresentation"
> & {
  prepareRepresentation(
    snapshot: SourceDocumentSnapshot,
    request: SourceDocumentRepresentationRequest,
  ): Promise<RepresentationCandidate>;
};
/** The page-level startup flag that createEmbeddedDocumentProvider reads. */
type StartupFlag = { TW_EMBEDDED_DOCUMENT_VIEWS?: unknown };
type Fixture = Awaited<ReturnType<typeof fixture>>;
const ref = { providerId: "document-data", documentId: "story" };
const source = '# greeting\r\nmessage: "Hello" # inline\r\n';
const url = "data:text/javascript;base64,Ly8gZml4dHVyZQ==";
// Serialize fixture-native literal shadows back to ordinary SB3 tuples, as the VM does.
function serializedBlocks(dictionary: Record<string, PatchVmBlock>) {
  const primitive = (block: PatchVmBlock) => {
    const key =
      block?.opcode === "text"
        ? "TEXT"
        : /^math_/.test(block?.opcode)
          ? "NUM"
          : null;
    if (!key) return null;
    const field = block.fields[key],
      value = Array.isArray(field) ? field[0] : field.value;
    return [key === "TEXT" ? 10 : 4, value];
  };
  const literal = (id: unknown) =>
    typeof id === "string" && dictionary[id]?.shadow
      ? primitive(dictionary[id]) || id
      : id;
  const result: Record<string, Record<string, any>> = {};
  for (const [id, block] of Object.entries(dictionary)) {
    if (block.shadow && primitive(block)) continue;
    result[id] = {
      ...block,
      inputs: Object.fromEntries(
        Object.entries<any>(block.inputs || {}).map(([name, input]) => [
          name,
          Array.isArray(input)
            ? input
            : input.block === input.shadow
              ? [1, literal(input.block)]
              : input.shadow
                ? [3, literal(input.block), literal(input.shadow)]
                : [2, literal(input.block)],
        ]),
      ),
      fields: Object.fromEntries(
        Object.entries<any>(block.fields || {}).map(([name, field]) => [
          name,
          Array.isArray(field)
            ? field
            : [field.value, ...(field.id === undefined ? [] : [field.id])],
        ]),
      ),
    };
    delete result[id].id;
  }
  return result;
}
const liveBlocks = (f: Fixture): Record<string, PatchVmBlock> =>
  f.targets[0].blocks._blocks;
function editText(f: Fixture, block: PatchVmBlock | undefined, value: string) {
  const input = block!.inputs.VALUE;
  const literal = f.targets[0].blocks.getBlock(input.block)!;
  literal.fields.TEXT.value = value;
}
async function fixture({
  format = "yaml",
  text = source,
  enabled = true,
  project: initial,
}: {
  format?: "yaml" | "json";
  text?: string;
  enabled?: boolean;
  project?: Record<string, any>;
} = {}) {
  const project: Record<string, any> = initial || {
    targets: [
      {
        isStage: true,
        blocks: {
          unrelated: {
            opcode: "event_whenflagclicked",
            parent: null,
            next: null,
            inputs: {},
            fields: {},
            topLevel: true,
            shadow: false,
          },
        },
        costumes: [],
      },
    ],
    extensions: ["kubohiroyadocumentdata", "kubohiroyaembeddedyaml"],
    extensionURLs: {
      kubohiroyadocumentdata: "https://example.test/data.js",
      kubohiroyaembeddedyaml: url,
    },
    extensionStorage: { other: { kept: true } },
  };
  const f = patchVm(project);
  for (const [index, target] of f.targets.entries())
    Object.defineProperty(project.targets[index], "blocks", {
      enumerable: true,
      configurable: true,
      get: () => serializedBlocks(target.blocks._blocks),
    });
  (
    f.vm.runtime as { getOpcodeFunction?: (opcode: string) => unknown }
  ).getOpcodeFunction = () => () => false;
  const asset = new Uint8Array([0, 1, 255]);
  f.targets[0].sprite.costumes.push({ asset });
  if (!initial) {
    const store = createSourceDocumentStore(f.vm);
    store.put({
      id: "story",
      filename: format === "yaml" ? "story.yaml" : "story.json",
      format,
      source: text,
    });
    store.put({
      id: "other",
      filename: "other.yaml",
      format: "yaml",
      source: "retained: true\n",
    });
    store.dispose();
  }
  const provider = createEmbeddedDocumentProvider(f.vm, {
    enabled,
    companionURL: url,
  });
  return {
    ...f,
    asset,
    rawProject: project,
    provider,
    get project() {
      return JSON.parse(f.vm.toJSON());
    },
    get loads() {
      return f.counts.loads;
    },
  };
}
const conversion = async (
  f: Fixture,
  direction: "from-source" | "to-source",
) => {
  const a = f.provider.open("story") as RepresentationAdapter,
    s = a.capture();
  const c = await a.prepareRepresentation(s, {
    kind: "yaml-blocks",
    direction,
  });
  return { a, s, c };
};
const reloadProvider = (f: Fixture) => {
  f.provider.dispose();
  f.provider = createEmbeddedDocumentProvider(f.vm, {
    enabled: true,
    companionURL: url,
  });
};
test("default OFF returns the raw provider and does not introduce conversion methods", async () => {
  const f = await fixture({ enabled: false });
  assert.equal(f.provider.open("story").prepareRepresentation, undefined);
  f.provider.dispose();
});
test("dry run creates no source copy, applies native blocks, then unchanged reverse preserves exact source and file hat", async () => {
  const f = await fixture(),
    before = structuredClone(f.project),
    { a, s, c } = await conversion(f, "from-source");
  assert.deepEqual(f.project, before);
  assert.equal(f.loads, 0);
  await a.commitRepresentation(s, c);
  reloadProvider(f);
  const owner = f.project.extensionStorage.kubohiroyadocumentdata;
  assert.equal(owner.documents.story.source, source);
  assert.equal(owner.documents.story.revision, "1");
  assert.equal(readDocumentViewMetadata(owner, ref)!.activeKind, "yaml-blocks");
  assert.equal(f.provider.list()[0].activeRepresentation, "yaml-blocks");
  assert(!JSON.stringify(owner.editorViews).includes("Hello"));
  assert.equal(f.project.extensionURLs.kubohiroyaembeddedyaml, url);
  const active = f.provider.open("story") as RepresentationAdapter,
    snap = active.capture();
  await assert.rejects(async () => active.prepare(snap, "message: changed\n"), {
    code: "DOCUMENT_VIEW_ACTIVE",
  });
  const unchanged = await active.prepareRepresentation(snap, {
    kind: "yaml-blocks",
    direction: "from-source",
  });
  assert.equal(unchanged.source, source);
  assert.equal(f.project.extensionStorage.kubohiroyadocumentdata.documents.story.revision, "1");
  const reverse = await active.prepareRepresentation(snap, {
    kind: "yaml-blocks",
    direction: "to-source",
  });
  await active.commitRepresentation(snap, reverse);
  assert.equal(
    f.project.extensionStorage.kubohiroyadocumentdata.documents.story.source,
    source,
  );
  assert.equal(
    f.project.extensionStorage.kubohiroyadocumentdata.documents.story.revision,
    "1",
  );
  const blocks: Record<string, Record<string, any>> =
    f.project.targets[0].blocks;
  assert.equal(
    Object.values(blocks).filter(
      (b) => b.opcode === "kubohiroyadocumentdata_sourceDocument",
    ).length,
    1,
  );
  assert.equal(
    Object.values(blocks).filter((b) =>
      b.opcode.startsWith("kubohiroyaembeddedyaml_"),
    ).length,
    0,
  );
  assert(blocks.unrelated);
  assert.equal(
    (f.targets[0].sprite.costumes[0] as { asset: unknown }).asset,
    f.asset,
  );
  assert.deepEqual(f.asset, new Uint8Array([0, 1, 255]));
  assert.equal(f.counts.saves, 0);
  assert.equal(f.counts.loads, 0);
  assert.equal(f.counts.stops, 0);
  assert.deepEqual(
    f.project.extensionStorage.other,
    before.extensionStorage.other,
  );
  assert.deepEqual(
    f.project.extensionStorage.kubohiroyadocumentdata.documents.other,
    before.extensionStorage.kubohiroyadocumentdata.documents.other,
  );
  f.provider.dispose();
});
test("literal edits update only selected source and revision; reloaded root IDs are rediscovered", async () => {
  const f = await fixture();
  let tx = await conversion(f, "from-source");
  await tx.a.commitRepresentation(tx.s, tx.c);
  reloadProvider(f);
  const blocks = liveBlocks(f);
  const [oldRoot, root] = Object.entries(blocks).find(
    ([, b]) => b.opcode === "kubohiroyadocumentdata_sourceDocument",
  )!;
  delete blocks[oldRoot];
  blocks.renamedHat = root;
  root.id = "renamedHat";
  blocks[root.next].parent = "renamedHat";
  editText(
    f,
    Object.values(blocks).find(
      (b) =>
        b.opcode.endsWith("_yamlScalar") &&
        f.targets[0].blocks.getBlock(b.inputs.VALUE.block)!.fields.TEXT.value ===
          "Hello",
    ),
    "Edited",
  );
  tx = await conversion(f, "to-source");
  await tx.a.commitRepresentation(tx.s, tx.c);
  const doc = f.project.extensionStorage.kubohiroyadocumentdata.documents.story;
  assert.match(doc.source, /Edited/);
  assert.match(doc.source, /# greeting/);
  assert.match(doc.source, /# inline/);
  assert.equal(doc.revision, "2");
  assert(f.project.targets[0].blocks.renamedHat);
  f.provider.dispose();
});
test("stale source revisions, foreign blocks, duplicate roots and externally shared graphs are rejected without mutation", async () => {
  for (const mode of [
    "stale",
    "foreign",
    "duplicate",
    "shared",
    "descriptor",
    "unknown-root-input",
  ]) {
    const f = await fixture();
    const tx = await conversion(f, "from-source");
    await tx.a.commitRepresentation(tx.s, tx.c);
    reloadProvider(f);
    const blocks = liveBlocks(f);
    const [rootId, root] = Object.entries(blocks).find(
      ([, b]) => b.opcode === "kubohiroyadocumentdata_sourceDocument",
    )!;
    if (mode === "stale")
      f.vm.runtime.extensionStorage.kubohiroyadocumentdata.documents.story.revision =
        "2";
    if (mode === "foreign") blocks[root.next].opcode = "looks_say";
    if (mode === "duplicate")
      blocks.duplicate = {
        ...structuredClone(root),
        id: "duplicate",
        next: null,
      };
    if (mode === "shared") blocks.unrelated.next = root.next;
    if (mode === "descriptor") {
      const state: { views: Record<string, Record<string, any>> } =
        f.vm.runtime.extensionStorage.kubohiroyadocumentdata.editorViews;
      Object.values(state.views)[0].descriptors["yaml-blocks"].opcodes.map =
        "event_whenflagclicked";
    }
    if (mode === "unknown-root-input")
      root.inputs.BAD = { name: "BAD", block: "unrelated", shadow: null };
    const before = structuredClone(f.project);
    await assert.rejects(conversion(f, "to-source"));
    await assert.rejects(conversion(f, "from-source"));
    assert.deepEqual(f.project, before);
    assert.equal(f.loads, 0);
    f.provider.dispose();
  }
});
test("native JSON conversion returns native JSON and unoccupied raw roots are reusable", async () => {
  const f = await fixture({ format: "json", text: '{"message":"Hello"}\r\n' });
  let tx = await conversion(f, "from-source");
  await tx.a.commitRepresentation(tx.s, tx.c);
  reloadProvider(f);
  editText(
    f,
    Object.values(liveBlocks(f)).find((b) => b.opcode.endsWith("_yamlScalar")),
    "JSON edited",
  );
  tx = await conversion(f, "to-source");
  await tx.a.commitRepresentation(tx.s, tx.c);
  reloadProvider(f);
  assert.equal(
    JSON.parse(
      f.project.extensionStorage.kubohiroyadocumentdata.documents.story.source,
    ).message,
    "JSON edited",
  );
  const count = Object.keys(f.project.targets[0].blocks).length;
  tx = await conversion(f, "from-source");
  await tx.a.commitRepresentation(tx.s, tx.c);
  assert(Object.keys(f.project.targets[0].blocks).length > count);
  f.provider.dispose();
});

test("occupied source hats and conflicting companion URLs are refused before loading", async () => {
  for (const mode of ["occupied", "url"]) {
    const f = await fixture();
    if (mode === "url")
      f.rawProject.extensionURLs.kubohiroyaembeddedyaml =
        "https://example.test/other.js";
    else
      liveBlocks(f).hat = {
        id: "hat",
        opcode: "kubohiroyadocumentdata_sourceDocument",
        parent: null,
        next: "unrelated",
        inputs: {},
        fields: { DOCUMENT: [encodeReference(ref), null] },
        topLevel: true,
      };
    const before = structuredClone(f.project);
    await assert.rejects(conversion(f, "from-source"));
    assert.deepEqual(f.project, before);
    assert.equal(f.loads, 0);
    f.provider.dispose();
  }
});
test("startup flag defaults OFF and is fixed when the provider is created", async () => {
  const previous = (globalThis as StartupFlag).TW_EMBEDDED_DOCUMENT_VIEWS;
  delete (globalThis as StartupFlag).TW_EMBEDDED_DOCUMENT_VIEWS;
  const f = await fixture({ enabled: false });
  f.provider.dispose();
  try {
    const off = createEmbeddedDocumentProvider(f.vm);
    (globalThis as StartupFlag).TW_EMBEDDED_DOCUMENT_VIEWS = true;
    assert.equal(off.open("story").prepareRepresentation, undefined);
    off.dispose();
    const on = createEmbeddedDocumentProvider(f.vm, { companionURL: url });
    (globalThis as StartupFlag).TW_EMBEDDED_DOCUMENT_VIEWS = false;
    assert.equal(typeof on.open("story").prepareRepresentation, "function");
    on.dispose();
  } finally {
    if (previous === undefined)
      delete (globalThis as StartupFlag).TW_EMBEDDED_DOCUMENT_VIEWS;
    else (globalThis as StartupFlag).TW_EMBEDDED_DOCUMENT_VIEWS = previous;
  }
});
test("document previews reflect the same edited active graph without mutating source, archives or other documents", async () => {
  const f = await fixture();
  let tx = await conversion(f, "from-source");
  await tx.a.commitRepresentation(tx.s, tx.c);
  reloadProvider(f);
  editText(
    f,
    Object.values(liveBlocks(f)).find(
      (b) =>
        b.opcode.endsWith("_yamlScalar") &&
        f.targets[0].blocks.getBlock(b.inputs.VALUE.block)!.fields.TEXT.value ===
          "Hello",
    ),
    "Preview edited",
  );
  const before = structuredClone(f.project),
    loads = f.loads,
    adapter = f.provider.open("story") as RepresentationAdapter,
    snapshot = adapter.capture();
  const raw = await adapter.previewRepresentation(snapshot, { kind: "source" }),
    blocks = await adapter.previewRepresentation(snapshot, {
      kind: "yaml-blocks",
    });
  assert.equal(raw.source, blocks.source);
  assert(raw.source.includes("Preview edited"));
  assert(raw.source.includes("# greeting"));
  assert(raw.source.includes("\r\n"));
  assert.equal(blocks.rootIds!.length, 1);
  assert(
    Object.values(blocks.blocks as Record<string, Record<string, any>>).some(
      (b) => b.inputs?.VALUE?.[1]?.[1] === "Preview edited",
    ),
  );
  assert(!JSON.stringify(blocks).includes("retained: true"));
  assert(!("project" in blocks));
  assert(!("extensionURLs" in blocks));
  assert(
    blocks.blockDefinitions!.every((d) => d.opcode.startsWith("kubohiroya")),
  );
  assert(Array.isArray(blocks.menus!.sourceDocuments.items));
  await assert.rejects(
    adapter.previewRepresentation(snapshot, { kind: "schema-blocks" }),
    { code: "REPRESENTATION_UNSUPPORTED" },
  );
  assert.deepEqual(f.project, before);
  assert.equal(f.loads, loads);
  f.provider.dispose();
});

for (const format of ["yaml", "json"] as const) test(`canonical registry same-kind ${format} Save commits the cached displayed source and retains the current view`, async () => {
  const f = await fixture({format,text:format === "yaml" ? source : '{"message":"Hello"}\r\n'});
  const initial = await conversion(f,"from-source");await initial.a.commitRepresentation(initial.s,initial.c);
  const registry = createSourceDocumentRegistry();registry.register(f.provider);
  const scalar=Object.values(liveBlocks(f)).find(b=>b.opcode.endsWith("_yamlScalar")&&f.targets[0].blocks.getBlock(b.inputs.VALUE.block)!.fields.TEXT?.value === "Hello");
  editText(f,scalar,"Saved in same kind");
  if(format === "yaml"){
    const comment=Object.values(liveBlocks(f)).find(b=>b.opcode.endsWith("_yamlLineComment"))!;
    f.targets[0].blocks.getBlock(comment.inputs.TEXT.block)!.fields.TEXT.value=" edited greeting";
  }
  const before=structuredClone(f.project),other=before.extensionStorage.kubohiroyadocumentdata.documents.other,unrelated=liveBlocks(f).unrelated;
  const adapter=registry.open(ref) as RepresentationAdapter,snapshot=adapter.capture();
  assert.deepEqual(registry.list()[0].representations![0].fromRepresentations,["yaml-blocks"]);
  const preview=await adapter.previewRepresentation(snapshot,{kind:"yaml-blocks"});
  assert.deepEqual(f.project,before);assert(preview.source.includes("Saved in same kind"));
  if(format === "yaml"){assert(preview.source.includes("# edited greeting"));assert(preview.source.includes("# inline"));assert(preview.source.includes("\r\n"));}
  const candidate=await adapter.prepareRepresentation(snapshot,{kind:"yaml-blocks",direction:"from-source"});
  assert.equal(candidate.source,preview.source);await adapter.commitRepresentation(snapshot,candidate);
  const saved=f.project.extensionStorage.kubohiroyadocumentdata;
  assert.equal(saved.documents.story.source,preview.source);assert.equal(saved.documents.story.revision,"2");
  assert.equal(readDocumentViewMetadata(saved,ref)!.activeKind,"yaml-blocks");
  assert.equal((readDocumentViewMetadata(saved,ref)!.descriptors["yaml-blocks"] as YamlViewDescriptor).baseSourceRevision,"2");
  assert.deepEqual(saved.documents.other,other);assert.equal(liveBlocks(f).unrelated,unrelated);assert.equal((f.targets[0].sprite.costumes[0] as {asset:unknown}).asset,f.asset);
  const visible = Object.keys(preview.blocks!).sort();
  const actual = Object.keys(f.project.targets[0].blocks).filter(id=>id!=="unrelated").sort();assert.deepEqual(actual,visible);
  const stable=structuredClone(f.project),fresh=adapter.capture();
  await adapter.previewRepresentation(fresh,{kind:"yaml-blocks"});
  const noOp=await adapter.prepareRepresentation(fresh,{kind:"yaml-blocks",direction:"from-source"});await adapter.commitRepresentation(fresh,noOp);assert.deepEqual(f.project,stable);
  assert.equal(f.counts.saves,0);assert.equal(f.counts.loads,0);assert.equal(f.counts.stops,0);
  registry.dispose();
});
