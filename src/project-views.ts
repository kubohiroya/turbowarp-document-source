import {
  prepareProjectPatch,
  applyProjectPatch,
  type ProjectPatchResult,
} from "./project-patch.ts";
export {
  canPatchProject as canPatchProjectRepresentations,
  installProjectPatchWorkspaceAdapter,
  projectPatchWorkspaceAdapterSymbol,
} from "./project-patch.ts";
export type {
  ProjectPatchTargetChange,
  ProjectPatchWorkspaceAdapter,
} from "./project-patch.ts";
import {
  normalizeSourceDocumentPreview,
  type SourceDocumentAdapter,
  type SourceDocumentPrepared,
  type SourceDocumentPreview,
  type SourceDocumentReference,
  type SourceDocumentSnapshot,
} from "@kubohiroya/turbowarp-document-data/composition";

export interface RepresentationRequest {
  kind: string;
  direction: "from-source" | "to-source";
}
export interface RepresentationCandidate {
  project: any;
  source: string;
  summary: string;
}
export interface RepresentationPreviewInput {
  project: any;
  source: string;
  reference: SourceDocumentReference;
  kind: string;
}
export interface RepresentationPreviewArtifact {
  preview: SourceDocumentPreview;
  candidate?: RepresentationCandidate & { request: RepresentationRequest };
}
/** The VM surface observed here; project patches verify the rest themselves. */
export interface ProjectRepresentationVM {
  toJSON(
    optimize: undefined,
    options: { allowOptimization: false },
  ): string;
  runtime: {
    on?(event: string, listener: () => void): unknown;
    off?(event: string, listener: () => void): unknown;
  };
}
export interface ProjectRepresentationAdapterOptions {
  vm: ProjectRepresentationVM;
  adapter: SourceDocumentAdapter;
  reference: SourceDocumentReference;
  buildPreviewArtifact?:
    | ((
        input: RepresentationPreviewInput,
      ) => Promise<RepresentationPreviewArtifact> | RepresentationPreviewArtifact)
    | undefined;
  buildPreview?:
    | ((
        input: RepresentationPreviewInput,
      ) => Promise<SourceDocumentPreview> | SourceDocumentPreview)
    | undefined;
  buildCandidate(input: {
    project: any;
    source: string;
    reference: SourceDocumentReference;
    request: RepresentationRequest;
  }): Promise<RepresentationCandidate> | RepresentationCandidate;
}
export type ProjectRepresentationCommit = ProjectPatchResult & {
  source: string;
  representation: string;
  direction: RepresentationRequest["direction"];
};
/** The public handle of a prepared conversion; its project candidate stays private. */
export type ProjectRepresentationCandidate = Readonly<
  RepresentationRequest & { summary: string; source: string }
>;
export type ProjectRepresentationAdapter = Omit<
  SourceDocumentAdapter,
  "prepareRepresentation" | "commitRepresentation"
> & {
  prepareRepresentation(
    snapshot: SourceDocumentSnapshot,
    request: RepresentationRequest,
  ): Promise<ProjectRepresentationCandidate>;
  commitRepresentation(
    snapshot: SourceDocumentSnapshot,
    candidate: ProjectRepresentationCandidate,
  ): Promise<ProjectRepresentationCommit>;
};
interface PreviewArtifact extends RepresentationCandidate {
  request: RepresentationRequest;
  validatedEpoch: number;
}
interface PreviewEntry {
  bucket: Map<string, PreviewEntry>;
  kind: string;
  model: SourceDocumentPreview;
  artifact: PreviewArtifact | undefined;
  bytes: number;
}
interface SnapshotRecord {
  generation: number;
  fingerprint: string;
}

const fail = (code: string, message: string, extra?: Record<string, unknown>) =>
  Object.assign(new Error(message), { code, ...extra });

/** Keep owner previews private and apply validated document changes through selective VM patches. */
export function createProjectRepresentationAdapter({
  vm,
  adapter,
  reference,
  buildCandidate,
  buildPreview,
  buildPreviewArtifact,
}: ProjectRepresentationAdapterOptions): ProjectRepresentationAdapter {
  if (
    !vm ||
    typeof vm.toJSON !== "function" ||
    typeof buildCandidate !== "function"
  ) {
    throw new TypeError(
      "A real VM, document adapter and pure candidate builder are required.",
    );
  }
  if (buildPreview !== undefined && typeof buildPreview !== "function")
    throw new TypeError("A preview builder must be a pure function.");
  if (
    buildPreviewArtifact !== undefined &&
    typeof buildPreviewArtifact !== "function"
  )
    throw new TypeError("An artifact builder must be a pure function.");
  const snapshots = new WeakMap<SourceDocumentSnapshot, SnapshotRecord>(),
    candidates = new WeakMap<
      ProjectRepresentationCandidate,
      {
        snapshot: SourceDocumentSnapshot;
        source: string;
        project: any;
        validatedEpoch: number | undefined;
      }
    >();
  const previewLRU = new Map<PreviewEntry, true>(),
    maxPreviewEntries = 3,
    maxPreviewBytes = 8 * 1024 * 1024;
  let previewModels = new WeakMap<
      SourceDocumentSnapshot,
      Map<string, PreviewEntry>
    >(),
    previewPending = new WeakMap<
      SourceDocumentSnapshot,
      Map<string, Promise<SourceDocumentPreview>>
    >(),
    baseContexts = new WeakMap<SourceDocumentSnapshot, any>(),
    previewBytes = 0,
    previewEpoch = 0;
  let disposed = false,
    generation = 0,
    applying = false;
  const clearPreviews = () => {
    previewEpoch++;
    previewModels = new WeakMap();
    previewPending = new WeakMap();
    baseContexts = new WeakMap();
    previewLRU.clear();
    previewBytes = 0;
  };
  const loaded = () => {
    generation++;
    clearPreviews();
  };
  vm.runtime.on?.("PROJECT_LOADED", loaded);
  vm.runtime.on?.("RUNTIME_DISPOSED", loaded);
  vm.runtime.on?.("PROJECT_CHANGED", clearPreviews);
  const cachePreview = (
    snapshot: SourceDocumentSnapshot,
    kind: string,
    model: SourceDocumentPreview,
    artifact: PreviewArtifact | undefined,
  ) => {
    let bucket = previewModels.get(snapshot);
    if (!bucket) {
      bucket = new Map();
      previewModels.set(snapshot, bucket);
    }
    const bytes = new TextEncoder().encode(JSON.stringify(model)).byteLength;
    if (bytes > maxPreviewBytes) return;
    const entry: PreviewEntry = { bucket, kind, model, artifact, bytes };
    bucket.set(kind, entry);
    previewLRU.set(entry, true);
    previewBytes += bytes;
    while (
      previewLRU.size > maxPreviewEntries ||
      previewBytes > maxPreviewBytes
    ) {
      const oldest = previewLRU.keys().next().value!;
      previewLRU.delete(oldest);
      if (oldest.bucket.get(oldest.kind) === oldest)
        oldest.bucket.delete(oldest.kind);
      previewBytes -= oldest.bytes;
    }
  };
  const serializedProject = () =>
    vm.toJSON(undefined, { allowOptimization: false });
  const active = () => {
    if (disposed)
      throw fail("DOCUMENT_CLOSED", "The representation editor is closed.");
  };
  const baseline = (snapshot: SourceDocumentSnapshot): SnapshotRecord => {
    active();
    const record = snapshots.get(snapshot);
    if (
      !record ||
      record.generation !== generation ||
      record.fingerprint !== serializedProject()
    )
      throw fail(
        "PROJECT_CONFLICT",
        "The project changed. Open the document again.",
      );
    return record;
  };
  const immutableObjects = new WeakSet<object>();
  const immutableProject = <T>(project: T): T => {
    const seen = new Set<object>();
    const visit = (value: unknown): unknown => {
      if (
        !value ||
        typeof value !== "object" ||
        immutableObjects.has(value) ||
        seen.has(value)
      )
        return value;
      seen.add(value);
      Object.values(value).forEach(visit);
      Object.freeze(value);
      immutableObjects.add(value);
      return value;
    };
    return visit(project) as T;
  };
  const baseContext = (
    snapshot: SourceDocumentSnapshot,
    record = baseline(snapshot),
  ): any => {
    let context = baseContexts.get(snapshot);
    if (!context) {
      context = immutableProject(JSON.parse(record.fingerprint));
      baseContexts.set(snapshot, context);
    }
    return context;
  };
  const checkedCandidate = <T extends RepresentationCandidate>(
    candidate: T | null | undefined,
  ): T => {
    if (
      !candidate ||
      typeof candidate.source !== "string" ||
      typeof candidate.summary !== "string" ||
      !candidate.summary ||
      !Array.isArray(candidate.project?.targets)
    )
      throw fail(
        "REPRESENTATION_INVALID",
        "The owner returned an invalid project candidate.",
      );
    return candidate;
  };
  const sameRequest = (
    a: RepresentationRequest | undefined,
    b: RepresentationRequest | undefined,
  ) => a?.kind === b?.kind && a?.direction === b?.direction;
  const publicCandidate = (
    snapshot: SourceDocumentSnapshot,
    request: RepresentationRequest,
    built: RepresentationCandidate,
    validatedEpoch: number | undefined,
  ): ProjectRepresentationCandidate => {
    const candidate: ProjectRepresentationCandidate = Object.freeze({
      kind: request.kind,
      direction: request.direction,
      summary: built.summary,
      source: built.source,
    });
    // This record only borrows the private artifact. Releasing it cannot mutate the cache object.
    candidates.set(candidate, {
      snapshot,
      source: built.source,
      project: built.project,
      validatedEpoch,
    });
    return candidate;
  };
  return Object.freeze({
    inspect: () => adapter.inspect(),
    capture() {
      active();
      clearPreviews();
      const snapshot = adapter.capture();
      // Keep one immutable serialization, not another parsed copy of embedded assets/code.
      snapshots.set(snapshot, { generation, fingerprint: serializedProject() });
      return snapshot;
    },
    prepare: (snapshot: SourceDocumentSnapshot, source: string) =>
      adapter.prepare(snapshot, source),
    commit: (snapshot: SourceDocumentSnapshot, prepared: SourceDocumentPrepared) =>
      adapter.commit(snapshot, prepared),
    ...(typeof buildPreview === "function" ||
    typeof buildPreviewArtifact === "function"
      ? {
          previewRepresentation(
            snapshot: SourceDocumentSnapshot,
            request: { readonly kind: string },
          ): Promise<SourceDocumentPreview> {
            try {
              if (
                !request ||
                typeof request.kind !== "string" ||
                !request.kind ||
                request.kind.length > 1024
              )
                throw fail(
                  "DOCUMENT_PREVIEW_INVALID",
                  "Choose a preview representation.",
                );
              // A hit never bypasses the complete current-project and session check.
              const record = baseline(snapshot),
                kind = request.kind;
              const cached = previewModels.get(snapshot)?.get(kind);
              if (cached) {
                previewLRU.delete(cached);
                previewLRU.set(cached, true);
                return Promise.resolve(cached.model);
              }
              let pending = previewPending.get(snapshot);
              if (!pending) {
                pending = new Map();
                previewPending.set(snapshot, pending);
              }
              if (pending.has(kind)) return pending.get(kind)!;
              const epoch = previewEpoch;
              const work = (async () => {
                const input: RepresentationPreviewInput = {
                  project:
                    typeof buildPreviewArtifact === "function"
                      ? baseContext(snapshot, record)
                      : JSON.parse(record.fingerprint),
                  source: snapshot.source,
                  reference,
                  kind,
                };
                const built: RepresentationPreviewArtifact =
                  typeof buildPreviewArtifact === "function"
                    ? await buildPreviewArtifact(input)
                    : { preview: await buildPreview!(input) };
                baseline(snapshot);
                const normalized = normalizeSourceDocumentPreview(
                  built?.preview,
                  kind,
                );
                let artifact: PreviewArtifact | undefined;
                if (built.candidate !== undefined) {
                  const candidate = checkedCandidate(built.candidate),
                    request = candidate.request;
                  if (
                    !request ||
                    typeof request.kind !== "string" ||
                    !request.kind ||
                    !["from-source", "to-source"].includes(request.direction)
                  )
                    throw fail(
                      "REPRESENTATION_INVALID",
                      "The preview candidate requires a conversion request.",
                    );
                  if (candidate.source !== normalized.source) {
                    throw fail(
                      "REPRESENTATION_INVALID",
                      "The cached conversion must match the source shown in its preview.",
                    );
                  }
                  await adapter.prepare(snapshot, candidate.source);
                  baseline(snapshot);
                  artifact = Object.freeze({
                    request: Object.freeze({ ...request }),
                    project: immutableProject(candidate.project),
                    source: candidate.source,
                    summary: candidate.summary,
                    validatedEpoch: epoch,
                  });
                }
                if (previewEpoch === epoch)
                  cachePreview(snapshot, kind, normalized, artifact);
                return normalized;
              })().finally(() => {
                if (pending!.get(kind) === work) pending!.delete(kind);
              });
              pending.set(kind, work);
              return work;
            } catch (error) {
              return Promise.reject(error);
            }
          },
        }
      : {}),
    async prepareRepresentation(
      snapshot: SourceDocumentSnapshot,
      request: RepresentationRequest,
    ) {
      if (
        !request ||
        typeof request.kind !== "string" ||
        !["from-source", "to-source"].includes(request.direction)
      )
        throw fail(
          "REPRESENTATION_INVALID",
          "Choose a representation and conversion direction.",
        );
      const record = baseline(snapshot);
      for (const entry of previewModels.get(snapshot)?.values() ?? []) {
        if (
          entry.artifact?.validatedEpoch === previewEpoch &&
          sameRequest(entry.artifact.request, request)
        ) {
          previewLRU.delete(entry);
          previewLRU.set(entry, true);
          return publicCandidate(
            snapshot,
            request,
            entry.artifact,
            previewEpoch,
          );
        }
      }
      const built = checkedCandidate(
        await buildCandidate({
          project: JSON.parse(record.fingerprint),
          source: snapshot.source,
          reference,
          request: Object.freeze({ ...request }),
        }),
      );
      baseline(snapshot);
      await adapter.prepare(snapshot, built.source);
      baseline(snapshot);
      return publicCandidate(snapshot, request, built, undefined);
    },
    async commitRepresentation(
      snapshot: SourceDocumentSnapshot,
      candidate: ProjectRepresentationCandidate,
    ): Promise<ProjectRepresentationCommit> {
      const prepared = candidates.get(candidate);
      if (!prepared || prepared.snapshot !== snapshot)
        throw fail(
          "REPRESENTATION_INVALID",
          "Prepare this representation in the same editing session first.",
        );
      if (applying)
        throw fail(
          "REPRESENTATION_BUSY",
          "Another representation is being applied.",
        );
      const record = baseline(snapshot);
      applying = true;
      try {
        if (prepared.validatedEpoch !== previewEpoch)
          await adapter.prepare(snapshot, snapshot.source);
        baseline(snapshot);
        const patch = await prepareProjectPatch({
          vm,
          baseProject: baseContext(snapshot, record),
          candidateProject: prepared.project,
          assertCurrent: () => baseline(snapshot),
        });
        baseline(snapshot);
        const result = applyProjectPatch(patch);
        candidates.delete(candidate);
        prepared.project = null;
        return {
          source: prepared.source,
          representation: candidate.kind,
          direction: candidate.direction,
          // The patch result begins with projectPatched: true.
          ...result,
        };
      } finally {
        applying = false;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      clearPreviews();
      vm.runtime.off?.("PROJECT_LOADED", loaded);
      vm.runtime.off?.("RUNTIME_DISPOSED", loaded);
      vm.runtime.off?.("PROJECT_CHANGED", clearPreviews);
      adapter.dispose();
    },
  });
}
