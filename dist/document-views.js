import { createSourceDocumentProvider, createSourceDocumentStore, sourceDocumentStorageId } from '@kubohiroya/turbowarp-document-data/source-documents';
import { parseSourceSyntax } from '@kubohiroya/turbowarp-yaml-json/source-syntax';
import { encodeReference, readReference, fail } from "./reference.js";
import { createYamlBlockOpcodes, createYamlBlockDefinitions, createYamlBlockMenus, yamlBlockOperations } from "./yaml-blocks.js";
import { createEmbeddedYamlHatDefinition } from "./hat.js";
import { createYamlSourceBlockView, readYamlSourceBlockView } from "./yaml-source-view.js";
import { readDocumentViewMetadata, writeDocumentViewMetadata } from "./view-metadata.js";
import { createProjectRepresentationAdapter } from "./project-views.js";
import { canPatchProject } from "./project-patch.js";
import { yamlBlockRuntimeId } from "./runtime.js";
const rootOpcode = 'kubohiroyadocumentdata_sourceDocument';
const knownShadows = new Set(['text', 'math_number', 'math_integer', 'math_whole_number', 'math_positive_number', 'math_angle']);
const clone = (value) => JSON.parse(JSON.stringify(value));
const activeKind = (owner, reference) => readDocumentViewMetadata(owner, reference)?.activeKind || 'source';
const ownerOf = (project) => {
    const owner = project.extensionStorage?.[sourceDocumentStorageId];
    if (!owner || owner.formatVersion !== 1 || !owner.documents || typeof owner.documents !== 'object')
        fail('DOCUMENT_STORAGE_INVALID', 'A persistent source owner is required.');
    return owner;
};
const referencesFrom = (block) => {
    const ids = typeof block.next === 'string' ? [block.next] : [];
    for (const input of Object.values(block.inputs || {})) {
        if (Array.isArray(input)) {
            for (const value of input.slice(1))
                if (typeof value === 'string')
                    ids.push(value);
        }
        else if (input && typeof input === 'object') {
            const { block, shadow } = input;
            if (typeof block === 'string')
                ids.push(block);
            if (typeof shadow === 'string')
                ids.push(shadow);
        }
    }
    return ids;
};
const locate = (project, reference) => {
    const matches = [];
    for (const target of project.targets || [])
        for (const [id, block] of Object.entries(target.blocks || {})) {
            if (block.opcode !== rootOpcode)
                continue;
            let ref;
            try {
                ref = readReference(block, { blocks: target.blocks });
            }
            catch {
                fail('DOCUMENT_VIEW_ROOT_INVALID', 'A source reference hat has an invalid document reference.');
            }
            if (encodeReference(ref) === encodeReference(reference))
                matches.push({ target, id, block });
        }
    if (matches.length > 1)
        fail('DOCUMENT_VIEW_ROOT_INVALID', 'Exactly one source reference hat may identify this document.');
    if (matches[0] && Object.keys(matches[0].block.inputs || {}).some(name => name !== 'DOCUMENT'))
        fail('DOCUMENT_VIEW_ROOT_INVALID', 'The source reference hat contains an unknown input.');
    if (matches[0] && (matches[0].block.parent !== null || matches[0].block.topLevel !== true))
        fail('DOCUMENT_VIEW_ROOT_INVALID', 'The source reference hat must be a top-level block.');
    return matches[0] || null;
};
const subtree = (target, root, opcodes) => {
    const owned = new Set(), allowed = new Set(Object.values(opcodes));
    const visit = (id) => {
        if (owned.has(id))
            fail('DOCUMENT_VIEW_GRAPH_INVALID', 'The document view is cyclic or shared.');
        const block = target.blocks[id];
        if (!block || (!allowed.has(block.opcode) && !(block.shadow === true && knownShadows.has(block.opcode))))
            fail('DOCUMENT_VIEW_GRAPH_INVALID', 'The source hat body contains a block outside its derived view.');
        owned.add(id);
        for (const next of referencesFrom(block))
            visit(next);
    };
    if (root.block.next)
        visit(root.block.next);
    for (const [id, block] of Object.entries(target.blocks))
        if (id !== root.id && !owned.has(id) && referencesFrom(block).some(next => owned.has(next)))
            fail('DOCUMENT_VIEW_GRAPH_INVALID', 'Another script shares a document view block.');
    return owned;
};
const companion = (project, url) => {
    project.extensions ||= [];
    if (!Array.isArray(project.extensions))
        fail('DOCUMENT_VIEW_PROJECT_INVALID', 'Project extensions must be an array.');
    if (!project.extensions.includes(sourceDocumentStorageId))
        project.extensions.push(sourceDocumentStorageId);
    if (!project.extensions.includes(yamlBlockRuntimeId))
        project.extensions.push(yamlBlockRuntimeId);
    project.extensionURLs ||= {};
    if (project.extensionURLs[yamlBlockRuntimeId] && project.extensionURLs[yamlBlockRuntimeId] !== url)
        fail('DOCUMENT_VIEW_RUNTIME_CONFLICT', 'The project already uses a different YAML block companion.');
    project.extensionURLs[yamlBlockRuntimeId] = url;
};
/** Optional derived representation owner; canonical text remains in Document Data storage. */
export function createEmbeddedDocumentProvider(vm, { enabled = globalThis.TW_EMBEDDED_DOCUMENT_VIEWS === true, companionURL, opcodes: requestedOpcodes = createYamlBlockOpcodes() } = {}) {
    const base = createSourceDocumentProvider(vm);
    if (enabled !== true)
        return base;
    let url;
    try {
        url = new URL(companionURL);
    }
    catch {
        base.dispose();
        fail('DOCUMENT_VIEW_RUNTIME_INVALID', 'A fixed companion runtime URL is required.');
    }
    if (typeof companionURL !== 'string' || url.username || url.password || /[\u0000-\u0020\u007f]/u.test(companionURL) || (url.protocol !== 'https:' && !(url.protocol === 'data:' && /^data:(?:text|application)\/javascript[;,]/u.test(companionURL)))) {
        base.dispose();
        fail('DOCUMENT_VIEW_RUNTIME_INVALID', 'The companion runtime must use HTTPS or an explicit JavaScript data URL.');
    }
    const names = Object.keys(createYamlBlockOpcodes());
    if (!requestedOpcodes || Object.keys(requestedOpcodes).length !== names.length || names.some(name => typeof requestedOpcodes[name] !== 'string' || !requestedOpcodes[name] || requestedOpcodes[name].length > 1024 || /[\u0000-\u0020\u007f]/u.test(requestedOpcodes[name])) || new Set(Object.values(requestedOpcodes)).size !== names.length) {
        base.dispose();
        fail('DOCUMENT_VIEW_RUNTIME_INVALID', 'A complete set of distinct block opcodes is required.');
    }
    const opcodes = Object.freeze({ ...requestedOpcodes });
    const store = createSourceDocumentStore(vm), opened = new Set();
    let disposed = false;
    const referenceFor = (documentId) => ({ providerId: base.id, documentId });
    const liveOwner = () => vm.runtime.extensionStorage[sourceDocumentStorageId];
    const requireSource = (ref) => { store.read(ref.documentId); if (activeKind(liveOwner(), ref) !== 'source')
        fail('DOCUMENT_VIEW_ACTIVE', 'Reflect the active block representation into source before editing the raw document or creating another view.'); };
    return Object.freeze({
        id: base.id, hatOpcodes: base.hatOpcodes,
        list: () => base.list().map(item => ({ ...item, activeRepresentation: activeKind(liveOwner(), referenceFor(item.documentId)), representations: [{ kind: 'yaml-blocks', label: 'YAML blocks', fromSource: true, toSource: true, fromRepresentations: ['yaml-blocks'], available: canPatchProject(vm), ...(!canPatchProject(vm) ? { reason: 'The VM cannot apply a local document block patch.' } : {}) }] })),
        subscribe: (listener) => base.subscribe(listener),
        open(documentId) {
            if (disposed)
                fail('DOCUMENT_CLOSED', 'The document provider is closed.');
            const reference = referenceFor(documentId), adapter = base.open(documentId);
            const buildCandidate = ({ project, source, request }) => {
                if (request.kind !== 'yaml-blocks')
                    fail('REPRESENTATION_UNSUPPORTED', 'This document supports the common YAML block representation.');
                const owner = ownerOf(project), record = owner.documents[documentId];
                if (!record || record.id !== documentId || record.source !== source)
                    fail('PROJECT_CONFLICT', 'The source document changed.');
                const state = readDocumentViewMetadata(owner, reference), active = state?.activeKind || 'source';
                let root = locate(project, reference);
                if (request.direction === 'from-source' && active === 'yaml-blocks') {
                    if (!root)
                        fail('DOCUMENT_VIEW_ROOT_INVALID', 'The active source reference hat is missing.');
                    const descriptor = state.descriptors['yaml-blocks'];
                    if (!descriptor || descriptor.rootOpcode !== rootOpcode || encodeReference(descriptor.reference) !== encodeReference(reference) || !descriptor.opcodes || Object.keys(descriptor.opcodes).length !== Object.keys(opcodes).length || Object.entries(opcodes).some(([name, opcode]) => descriptor.opcodes[name] !== opcode))
                        fail('DOCUMENT_VIEW_METADATA_INVALID', 'The active block representation does not match this document.');
                    const syntax = parseSourceSyntax(source, { format: record.format });
                    const result = readYamlSourceBlockView({ baseline: syntax.baseline, blocks: root.target.blocks, descriptor, sourceRevision: record.revision });
                    const owned = subtree(root.target, root, descriptor.opcodes);
                    if (result.source === source)
                        return { project, source, summary: `Save YAML blocks in ${record.filename}` };
                    if ([...owned].some(id => root.target.blocks[id].comment) || Object.values(root.target.comments || {}).some(comment => owned.has(comment.blockId)))
                        fail('DOCUMENT_VIEW_COMMENT_UNSUPPORTED', 'Keep standard comments before regenerating an edited YAML block view.');
                    const reflected = buildCandidate({ project, source, request: { kind: 'yaml-blocks', direction: 'to-source' } });
                    const rebuilt = buildCandidate({ project: reflected.project, source: reflected.source, request: { kind: 'yaml-blocks', direction: 'from-source' } });
                    return { ...rebuilt, summary: `Save YAML blocks in ${record.filename}` };
                }
                if (request.direction === 'from-source') {
                    if (active !== 'source')
                        fail('DOCUMENT_VIEW_ACTIVE', 'Reflect the active block representation into source first.');
                    if (root?.block.next)
                        fail('DOCUMENT_VIEW_OCCUPIED', 'The source hat already owns a body; it will not be replaced.');
                    const stages = project.targets.filter(target => target.isStage);
                    if (!root && stages.length !== 1)
                        fail('DOCUMENT_VIEW_ROOT_INVALID', 'One Stage is required to create a source reference hat.');
                    const target = root?.target || stages[0];
                    target.blocks ||= {};
                    const ids = new Set(project.targets.flatMap(t => Object.keys(t.blocks || {})));
                    let serial = 1;
                    while ([...ids].some(id => id.startsWith(`document-view-${serial}-`)))
                        serial++;
                    const prefix = `document-view-${serial}-`, rootId = root?.id || `${prefix}hat`;
                    const view = createYamlSourceBlockView({ source, format: record.format, sourceRevision: record.revision, reference, rootId, rootOpcode, opcodes, idPrefix: prefix, x: root?.block.x ?? 32, y: root?.block.y ?? 32 });
                    // The existing hat keeps all of its own fields and position.
                    if (root)
                        view.blocks[rootId] = { ...root.block, next: view.blocks[rootId].next };
                    Object.assign(target.blocks, view.blocks);
                    writeDocumentViewMetadata(owner, reference, { activeKind: 'yaml-blocks', descriptors: { ...(state?.descriptors || {}), 'yaml-blocks': view.descriptor } });
                    companion(project, companionURL);
                    return { project, source, summary: `Show ${record.filename} as YAML blocks` };
                }
                if (request.direction !== 'to-source' || active !== 'yaml-blocks' || !root)
                    fail('DOCUMENT_VIEW_INACTIVE', 'No active YAML block representation exists for this document.');
                const descriptor = state.descriptors['yaml-blocks'];
                if (!descriptor || descriptor.rootOpcode !== rootOpcode || encodeReference(descriptor.reference) !== encodeReference(reference))
                    fail('DOCUMENT_VIEW_METADATA_INVALID', 'The active block representation does not match this document.');
                if (!descriptor.opcodes || Object.keys(descriptor.opcodes).length !== Object.keys(opcodes).length || Object.entries(opcodes).some(([name, opcode]) => descriptor.opcodes[name] !== opcode))
                    fail('DOCUMENT_VIEW_METADATA_INVALID', 'The active view uses unknown block declarations.');
                const syntax = parseSourceSyntax(source, { format: record.format });
                const result = readYamlSourceBlockView({ baseline: syntax.baseline, blocks: root.target.blocks, descriptor, sourceRevision: record.revision });
                const owned = subtree(root.target, root, descriptor.opcodes);
                for (const id of owned)
                    delete root.target.blocks[id];
                root.block.next = null;
                if (result.source !== source) {
                    const revision = Number(record.revision);
                    if (!Number.isSafeInteger(revision) || revision < 1 || revision >= 999999999999999)
                        fail('DOCUMENT_REVISION_LIMIT', 'The source revision cannot be incremented.');
                    owner.documents[documentId] = { ...record, source: result.source, revision: String(revision + 1) };
                }
                writeDocumentViewMetadata(owner, reference, { activeKind: 'source', descriptors: { ...(state.descriptors || {}), 'yaml-blocks': { ...clone(descriptor), baseSourceRevision: owner.documents[documentId].revision } } });
                return { project, source: result.source, summary: `Reflect YAML blocks into ${record.filename}` };
            };
            const previewGraph = (project) => {
                const root = locate(project, reference);
                if (!root)
                    fail('DOCUMENT_VIEW_ROOT_INVALID', 'The preview document root is missing.');
                const ids = subtree(root.target, root, opcodes);
                ids.add(root.id);
                for (const id of referencesFrom({ ...root.block, next: null })) {
                    const shadow = root.target.blocks[id];
                    if (!shadow?.shadow || shadow.next || Object.keys(shadow.inputs || {}).length)
                        fail('DOCUMENT_VIEW_GRAPH_INVALID', 'The document reference must be literal.');
                    ids.add(id);
                }
                const blocks = Object.fromEntries([...ids].map(id => [id, clone(root.target.blocks[id])]));
                blocks[root.id].x = 24;
                blocks[root.id].y = 24;
                return { blocks, rootIds: [root.id] };
            };
            const previewProject = (project) => ({
                ...project,
                targets: project.targets.map(target => ({ ...target, blocks: Object.fromEntries(Object.entries(target.blocks || {}).map(([id, block]) => [id, { ...block }])) })),
                extensionStorage: { ...project.extensionStorage, [sourceDocumentStorageId]: { ...ownerOf(project), documents: { ...ownerOf(project).documents }, ...(ownerOf(project).editorViews ? { editorViews: clone(ownerOf(project).editorViews) } : {}) } },
                extensions: [...(project.extensions || [])], extensionURLs: { ...(project.extensionURLs || {}) }
            });
            const buildPreviewArtifact = ({ project, source, kind }) => {
                if (!['source', 'yaml-blocks'].includes(kind))
                    fail('REPRESENTATION_UNSUPPORTED', 'This owner does not provide a schema-specific block preview.');
                project = previewProject(project);
                const active = activeKind(ownerOf(project), reference);
                const request = kind === 'yaml-blocks' ? { kind: 'yaml-blocks', direction: 'from-source' } : active === 'source' ? null : { kind: active, direction: 'to-source' };
                const candidate = request ? buildCandidate({ project, source, request }) : null;
                if (candidate) {
                    project = candidate.project;
                    source = candidate.source;
                }
                if (kind === 'source')
                    return { preview: { kind, source }, ...(candidate ? { candidate: { ...candidate, request: request } } : {}) };
                const graph = previewGraph(project);
                const filename = ownerOf(project).documents[documentId].filename;
                const rootDefinition = createEmbeddedYamlHatDefinition({ BlockType: { HAT: 'hat' }, operation: 'sourceDocument', menuName: 'sourceDocuments', defaultReference: reference });
                const blockDefinitions = [{ ...rootDefinition, opcode: rootOpcode, text: 'embedded document [DOCUMENT]', colour: '#9a7037' }, ...createYamlBlockDefinitions().map(definition => ({ ...definition, opcode: opcodes[Object.keys(yamlBlockOperations).find(key => yamlBlockOperations[key] === definition.opcode)], colour: '#9a7037' }))];
                // Document Data normalizes and validates the complete preview model.
                const preview = { kind, source, ...graph, blockDefinitions, menus: { ...createYamlBlockMenus(), sourceDocuments: { acceptReporters: false, items: [{ text: filename, value: encodeReference(reference) }] } } };
                return { preview, ...(candidate ? { candidate: { ...candidate, request: request } } : {}) };
            };
            const wrapped = createProjectRepresentationAdapter({ vm, adapter, reference, buildCandidate, buildPreviewArtifact });
            const guarded = Object.freeze({ ...wrapped,
                prepare(snapshot, source) { requireSource(reference); return wrapped.prepare(snapshot, source); },
                commit(snapshot, candidate) { requireSource(reference); return wrapped.commit(snapshot, candidate); },
                dispose() { opened.delete(guarded); wrapped.dispose(); } });
            opened.add(guarded);
            return guarded;
        },
        dispose() { if (disposed)
            return; disposed = true; for (const adapter of [...opened])
            adapter.dispose(); store.dispose(); base.dispose(); }
    });
}
