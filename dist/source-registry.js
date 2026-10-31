import { getSourceDocumentRegistry } from '@kubohiroya/turbowarp-document-data/composition';
import { encodeReference, decodeReference, fail } from "./reference.js";
import { normalizeDocumentSource, readDocumentSourceURLs, writeDocumentSourceURL, fetchDocumentSource } from "./document-source.js";
import { canPatchProject, prepareProjectPatch, applyProjectPatch } from "./project-patch.js";
const slot = Symbol.for('@kubohiroya/turbowarp-document-source/registry/v1');
const referenceOf = (value) => typeof value === 'string' ? decodeReference(value) : decodeReference(encodeReference(value));
const originalTargets = (runtime) => runtime.targets.filter(target => target.isOriginal !== false);
const projectOf = (vm) => JSON.parse(vm.toJSON(undefined, { allowOptimization: false }));
/** Extends the canonical registry rather than creating a second source owner. */
export function getDocumentSourceRegistry(vm) {
    const base = getSourceDocumentRegistry(vm);
    const scope = vm;
    if (scope[slot]?.base === base)
        return scope[slot].registry;
    const owners = new Map();
    const sourceFor = (metadata) => {
        const url = readDocumentSourceURLs({ extensionStorage: vm.runtime.extensionStorage }).find(entry => encodeReference(entry.reference) === encodeReference(metadata.reference))?.url;
        return normalizeDocumentSource({ kind: url ? 'url' : metadata.activeRepresentation === 'yaml-blocks' ? 'yaml-blocks' : metadata.activeRepresentation === 'schema-blocks' ? 'schema-blocks' : 'embedded-file', filename: metadata.filename, format: metadata.format, ...(url ? { url } : {}) });
    };
    const registry = Object.freeze({
        apiVersion: base.apiVersion,
        sourceDocumentApiVersion: base.sourceDocumentApiVersion,
        get disposed() { return base.disposed; },
        register(provider, options = {}) {
            if (options.buildSourceCandidate !== undefined && typeof options.buildSourceCandidate !== 'function')
                throw new TypeError('An owner source builder is required.');
            if (options.buildSourceCandidate && typeof options.sourceStorageId !== 'string' && typeof options.sourceStorageId !== 'function')
                throw new TypeError('The owning extension storage ID is required.');
            const unregister = base.register(provider);
            owners.set(provider.id, options);
            return () => { owners.delete(provider.id); unregister(); };
        },
        list() {
            return Object.freeze(base.list().map(metadata => {
                const dataSource = sourceFor(metadata), owner = owners.get(metadata.reference.providerId);
                return Object.freeze({ ...metadata, dataSource, ...(owner?.dialogTitle ? { dialogTitle: owner.dialogTitle } : {}),
                    sourceLocationEditable: Boolean(owner?.buildSourceCandidate) && canPatchProject(vm),
                    ...(dataSource.kind === 'url' ? { activeRepresentation: 'source', representations: (metadata.representations || []).map(item => ({ ...item, available: false, reason: 'Embed the URL source before converting it to blocks.' })) } : {}) });
            }));
        },
        getHatOpcodes: () => base.getHatOpcodes(),
        subscribe: (listener) => base.subscribe(listener),
        dispose: () => base.dispose(),
        open(value) {
            const reference = referenceOf(value), key = encodeReference(reference), adapter = base.open(reference);
            const owner = owners.get(reference.providerId), controller = new AbortController();
            const runtime = vm.runtime;
            let closed = false, generation = 0, remote = null, loading = null;
            const snapshots = new WeakMap();
            const candidates = new WeakMap();
            const invalidated = () => { generation++; controller.abort(); };
            runtime.on?.('PROJECT_LOADED', invalidated);
            runtime.on?.('RUNTIME_DISPOSED', invalidated);
            const metadata = () => base.list().find(item => encodeReference(item.reference) === key) ?? fail('DOCUMENT_UNKNOWN', 'The source document is no longer registered.');
            const ensure = () => {
                if (closed || controller.signal.aborted || vm.runtime !== runtime || !adapter.inspect().available)
                    fail('DOCUMENT_CLOSED', 'The source editing session is no longer current.');
            };
            const guard = (snapshot) => {
                ensure();
                const saved = snapshots.get(snapshot);
                if (!saved || saved.generation !== generation || saved.fingerprint !== vm.toJSON(undefined, { allowOptimization: false }) || saved.storage !== runtime.extensionStorage || saved.targets.length !== originalTargets(runtime).length || saved.targets.some((target, index) => originalTargets(runtime)[index] !== target))
                    fail('PROJECT_CONFLICT', 'The project changed while resolving its source.');
                return saved;
            };
            return Object.freeze({
                inspect: () => closed ? { available: false, code: 'DOCUMENT_CLOSED' } : adapter.inspect(),
                async loadSource() {
                    ensure();
                    const descriptor = sourceFor(metadata());
                    if (descriptor.kind !== 'url')
                        return;
                    if (loading)
                        return loading;
                    const fingerprint = vm.toJSON(undefined, { allowOptimization: false });
                    const saved = adapter.capture();
                    loading = (async () => {
                        // A missing host fetch capability is rejected by fetchDocumentSource.
                        const fetched = await fetchDocumentSource(descriptor.url, { fetch: owner?.fetch, signal: controller.signal });
                        await adapter.prepare(saved, fetched.source);
                        ensure();
                        if (fingerprint !== vm.toJSON(undefined, { allowOptimization: false }))
                            fail('PROJECT_CONFLICT', 'The project changed while loading the URL.');
                        remote = { ...fetched, fingerprint };
                    })();
                    try {
                        await loading;
                    }
                    finally {
                        loading = null;
                    }
                },
                capture() {
                    ensure();
                    const baseSnapshot = adapter.capture(), descriptor = sourceFor(metadata());
                    if (descriptor.kind === 'url' && (!remote || remote.fingerprint !== vm.toJSON(undefined, { allowOptimization: false })))
                        fail('SOURCE_NOT_LOADED', 'Load the URL before viewing its source.');
                    const snapshot = descriptor.kind === 'url' ? Object.freeze({ source: remote.source, sourceName: descriptor.filename }) : baseSnapshot;
                    snapshots.set(snapshot, { baseSnapshot, fingerprint: vm.toJSON(undefined, { allowOptimization: false }), generation, storage: runtime.extensionStorage, targets: originalTargets(runtime) });
                    return snapshot;
                },
                async prepare(snapshot, source) {
                    const saved = guard(snapshot);
                    if (sourceFor(metadata()).kind === 'url')
                        fail('SOURCE_URL_READ_ONLY', 'Embed the URL source before editing it.');
                    return adapter.prepare(saved.baseSnapshot, source);
                },
                async commit(snapshot, prepared) {
                    const saved = guard(snapshot);
                    if (sourceFor(metadata()).kind === 'url')
                        fail('SOURCE_URL_READ_ONLY', 'Embed the URL source before editing it.');
                    return adapter.commit(saved.baseSnapshot, prepared);
                },
                async previewRepresentation(snapshot, request) {
                    const saved = guard(snapshot);
                    if (sourceFor(metadata()).kind === 'url') {
                        if (request.kind !== 'source')
                            fail('SOURCE_URL_READ_ONLY', 'Embed the URL source before converting it to blocks.');
                        return Object.freeze({ kind: 'source', source: snapshot.source });
                    }
                    return adapter.previewRepresentation ? adapter.previewRepresentation(saved.baseSnapshot, request) : { kind: 'source', source: snapshot.source };
                },
                ...(adapter.prepareRepresentation ? {
                    async prepareRepresentation(snapshot, request) {
                        const saved = guard(snapshot);
                        if (sourceFor(metadata()).kind === 'url')
                            fail('SOURCE_URL_READ_ONLY', 'Embed the URL source before converting it to blocks.');
                        return adapter.prepareRepresentation(saved.baseSnapshot, request);
                    },
                    async commitRepresentation(snapshot, candidate) { return adapter.commitRepresentation(guard(snapshot).baseSnapshot, candidate); }
                } : {}),
                ...(owner?.buildSourceCandidate ? {
                    async prepareDataSource(snapshot, requested) {
                        guard(snapshot);
                        const descriptor = normalizeDocumentSource({ ...requested, filename: metadata().filename, format: metadata().format });
                        if (!['url', 'embedded-file'].includes(descriptor.kind))
                            fail('SOURCE_KIND_INVALID', 'Use the owner representation adapter to convert blocks.');
                        let source = snapshot.source;
                        if (descriptor.kind === 'url')
                            source = descriptor.url === remote?.url ? remote.source : (await fetchDocumentSource(descriptor.url, { fetch: owner.fetch, signal: controller.signal })).source;
                        else if (sourceFor(metadata()).representation !== 'source')
                            source = (await adapter.previewRepresentation(guard(snapshot).baseSnapshot, { kind: 'source' })).source;
                        guard(snapshot);
                        const baseProject = projectOf(vm);
                        const built = await owner.buildSourceCandidate({ project: structuredClone(baseProject), reference, source });
                        guard(snapshot);
                        if (!built?.project || built.source !== source)
                            fail('SOURCE_CANDIDATE_INVALID', 'The owner must validate the exact source that will be saved.');
                        writeDocumentSourceURL(built.project, reference, descriptor.kind === 'url' ? descriptor.url : null, (typeof owner.sourceStorageId === 'function' ? owner.sourceStorageId(built.project) : owner.sourceStorageId));
                        const patch = await prepareProjectPatch({ vm, baseProject, candidateProject: built.project, assertCurrent: () => guard(snapshot) });
                        const candidate = Object.freeze({ source, dataSource: descriptor });
                        candidates.set(candidate, { snapshot, patch });
                        return candidate;
                    },
                    commitDataSource(snapshot, candidate) {
                        guard(snapshot);
                        const saved = candidates.get(candidate);
                        if (!saved || saved.snapshot !== snapshot)
                            fail('SOURCE_CANDIDATE_INVALID', 'Prepare this source in the same editing session.');
                        candidates.delete(candidate);
                        const result = applyProjectPatch(saved.patch);
                        return { ...result, source: candidate.source };
                    }
                } : {}),
                dispose() {
                    if (closed)
                        return;
                    closed = true;
                    controller.abort();
                    runtime.off?.('PROJECT_LOADED', invalidated);
                    runtime.off?.('RUNTIME_DISPOSED', invalidated);
                    adapter.dispose();
                }
            });
        }
    });
    Object.defineProperty(vm, slot, { value: { base, registry }, configurable: true });
    return registry;
}
