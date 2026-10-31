import type {SourceDocumentPreview, SourceDocumentProvider, SourceDocumentReference} from '@kubohiroya/turbowarp-document-data/composition';
import {createSourceDocumentProvider, createSourceDocumentStore, sourceDocumentStorageId, type PersistentSourceDocument, type SourceDocumentVM} from '@kubohiroya/turbowarp-document-data/source-documents';
import {parseSourceSyntax} from '@kubohiroya/turbowarp-yaml-json/source-syntax';
import {encodeReference, readReference, fail} from './reference.ts';
import {createYamlBlockOpcodes, createYamlBlockDefinitions, createYamlBlockMenus, yamlBlockOperations, type YamlBlockOpcodes, type YamlViewBlock, type YamlViewDescriptor} from './yaml-blocks.ts';
import {createEmbeddedYamlHatDefinition} from './hat.ts';
import {createYamlSourceBlockView, readYamlSourceBlockView} from './yaml-source-view.ts';
import {readDocumentViewMetadata, writeDocumentViewMetadata, type DocumentViewState} from './view-metadata.ts';
import {createProjectRepresentationAdapter, type ProjectRepresentationVM, type RepresentationCandidate, type RepresentationRequest} from './project-views.ts';
import {canPatchProject} from './project-patch.ts';
import {yamlBlockRuntimeId} from './runtime.ts';
/** The VM surface shared by Document Data storage and representation patches. */
export type EmbeddedDocumentVM = SourceDocumentVM & ProjectRepresentationVM;
/** Both the plain and the view-enabled provider own resources that the host must release. */
export type EmbeddedDocumentProvider = SourceDocumentProvider & {dispose(): void};
export interface EmbeddedDocumentProviderOptions {
    enabled?: boolean;
    companionURL: string;
    opcodes?: YamlBlockOpcodes;
}
type Block = {opcode?: unknown; next?: string | null; parent?: string | null; topLevel?: unknown; shadow?: unknown; comment?: unknown; x?: number; y?: number; inputs?: Record<string, unknown>; fields?: Record<string, unknown>};
type Target = {isStage?: boolean; blocks: Record<string, Block>; comments?: Record<string, {blockId?: unknown}>};
type Project = {targets: Target[]; extensions?: string[]; extensionURLs?: Record<string, string>; extensionStorage?: Record<string, any>};
type SourceOwner = Record<string, unknown> & {formatVersion: 1; documents: Record<string, PersistentSourceDocument>; editorViews?: unknown};
type Root = {target: Target; id: string; block: Block};
const rootOpcode = 'kubohiroyadocumentdata_sourceDocument';
const knownShadows = new Set<unknown>(['text','math_number','math_integer','math_whole_number','math_positive_number','math_angle']);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const activeKind = (owner: Record<string, unknown>, reference: SourceDocumentReference) => readDocumentViewMetadata(owner, reference)?.activeKind || 'source';
const ownerOf = (project: Project): SourceOwner => {
    const owner = project.extensionStorage?.[sourceDocumentStorageId];
    if (!owner || owner.formatVersion !== 1 || !owner.documents || typeof owner.documents !== 'object') fail('DOCUMENT_STORAGE_INVALID','A persistent source owner is required.');
    return owner;
};
const referencesFrom = (block: Block): string[] => {
    const ids = typeof block.next === 'string' ? [block.next] : [];
    for (const input of Object.values(block.inputs || {})) {
        if (Array.isArray(input)) { for (const value of input.slice(1)) if (typeof value === 'string') ids.push(value); }
        else if (input && typeof input === 'object') { const {block, shadow} = input as {block?: unknown; shadow?: unknown}; if (typeof block === 'string') ids.push(block); if (typeof shadow === 'string') ids.push(shadow); }
    }
    return ids;
};
const locate = (project: Project, reference: SourceDocumentReference): Root | null => {
    const matches: Root[] = [];
    for (const target of project.targets || []) for (const [id, block] of Object.entries(target.blocks || {})) {
        if (block.opcode !== rootOpcode) continue;
        let ref: SourceDocumentReference; try { ref = readReference(block, {blocks: target.blocks}); } catch { fail('DOCUMENT_VIEW_ROOT_INVALID','A source reference hat has an invalid document reference.'); }
        if (encodeReference(ref) === encodeReference(reference)) matches.push({target,id,block});
    }
    if (matches.length > 1) fail('DOCUMENT_VIEW_ROOT_INVALID','Exactly one source reference hat may identify this document.');
    if (matches[0] && Object.keys(matches[0].block.inputs || {}).some(name => name !== 'DOCUMENT')) fail('DOCUMENT_VIEW_ROOT_INVALID','The source reference hat contains an unknown input.');
    if (matches[0] && (matches[0].block.parent !== null || matches[0].block.topLevel !== true)) fail('DOCUMENT_VIEW_ROOT_INVALID','The source reference hat must be a top-level block.');
    return matches[0] || null;
};
const subtree = (target: Target, root: Root, opcodes: YamlBlockOpcodes): Set<string> => {
    const owned = new Set<string>(), allowed = new Set<unknown>(Object.values(opcodes));
    const visit = (id: string) => {
        if (owned.has(id)) fail('DOCUMENT_VIEW_GRAPH_INVALID','The document view is cyclic or shared.');
        const block = target.blocks[id];
        if (!block || (!allowed.has(block.opcode) && !(block.shadow === true && knownShadows.has(block.opcode)))) fail('DOCUMENT_VIEW_GRAPH_INVALID','The source hat body contains a block outside its derived view.');
        owned.add(id); for (const next of referencesFrom(block)) visit(next);
    };
    if (root.block.next) visit(root.block.next);
    for (const [id, block] of Object.entries(target.blocks)) if (id !== root.id && !owned.has(id) && referencesFrom(block).some(next => owned.has(next))) fail('DOCUMENT_VIEW_GRAPH_INVALID','Another script shares a document view block.');
    return owned;
};
const companion = (project: Project, url: string) => {
    project.extensions ||= [];
    if (!Array.isArray(project.extensions)) fail('DOCUMENT_VIEW_PROJECT_INVALID','Project extensions must be an array.');
    if (!project.extensions.includes(sourceDocumentStorageId)) project.extensions.push(sourceDocumentStorageId);
    if (!project.extensions.includes(yamlBlockRuntimeId)) project.extensions.push(yamlBlockRuntimeId);
    project.extensionURLs ||= {};
    if (project.extensionURLs[yamlBlockRuntimeId] && project.extensionURLs[yamlBlockRuntimeId] !== url) fail('DOCUMENT_VIEW_RUNTIME_CONFLICT','The project already uses a different YAML block companion.');
    project.extensionURLs[yamlBlockRuntimeId] = url;
};
/** Optional derived representation owner; canonical text remains in Document Data storage. */
export function createEmbeddedDocumentProvider(vm: EmbeddedDocumentVM, {enabled = (globalThis as {TW_EMBEDDED_DOCUMENT_VIEWS?: unknown}).TW_EMBEDDED_DOCUMENT_VIEWS === true, companionURL, opcodes: requestedOpcodes = createYamlBlockOpcodes()}: EmbeddedDocumentProviderOptions = {} as EmbeddedDocumentProviderOptions): EmbeddedDocumentProvider {
    const base = createSourceDocumentProvider(vm) as EmbeddedDocumentProvider;
    if (enabled !== true) return base;
    let url: URL; try {url = new URL(companionURL);} catch {base.dispose();fail('DOCUMENT_VIEW_RUNTIME_INVALID','A fixed companion runtime URL is required.');}
    if (typeof companionURL !== 'string' || url.username || url.password || /[\u0000-\u0020\u007f]/u.test(companionURL) || (url.protocol !== 'https:' && !(url.protocol === 'data:' && /^data:(?:text|application)\/javascript[;,]/u.test(companionURL)))) {base.dispose();fail('DOCUMENT_VIEW_RUNTIME_INVALID','The companion runtime must use HTTPS or an explicit JavaScript data URL.');}
    const names = Object.keys(createYamlBlockOpcodes()) as (keyof YamlBlockOpcodes)[];
    if (!requestedOpcodes || Object.keys(requestedOpcodes).length !== names.length || names.some(name => typeof requestedOpcodes[name] !== 'string' || !requestedOpcodes[name] || requestedOpcodes[name].length > 1024 || /[\u0000-\u0020\u007f]/u.test(requestedOpcodes[name])) || new Set(Object.values(requestedOpcodes)).size !== names.length) {base.dispose();fail('DOCUMENT_VIEW_RUNTIME_INVALID','A complete set of distinct block opcodes is required.');}
    const opcodes = Object.freeze({...requestedOpcodes});
    const store = createSourceDocumentStore(vm), opened = new Set<ReturnType<SourceDocumentProvider['open']>>();
    let disposed = false;
    const referenceFor = (documentId: string): SourceDocumentReference => ({providerId: base.id, documentId});
    const liveOwner = () => vm.runtime.extensionStorage[sourceDocumentStorageId] as Record<string, unknown>;
    const requireSource = (ref: SourceDocumentReference) => { store.read(ref.documentId); if (activeKind(liveOwner(), ref) !== 'source') fail('DOCUMENT_VIEW_ACTIVE','Reflect the active block representation into source before editing the raw document or creating another view.'); };
    return Object.freeze({
        id: base.id, hatOpcodes: base.hatOpcodes!,
        list: () => base.list().map(item => ({...item, activeRepresentation: activeKind(liveOwner(), referenceFor(item.documentId)), representations: [{kind:'yaml-blocks',label:'YAML blocks',fromSource:true,toSource:true,fromRepresentations:['yaml-blocks'],available:canPatchProject(vm),...(!canPatchProject(vm)?{reason:'The VM cannot apply a local document block patch.'}:{})}]})),
        subscribe: (listener: () => void) => base.subscribe!(listener),
        open(documentId: string) {
            if (disposed) fail('DOCUMENT_CLOSED','The document provider is closed.');
            const reference = referenceFor(documentId), adapter = base.open(documentId);
            const buildCandidate = ({project, source, request}: {project: Project; source: string; request: RepresentationRequest}): RepresentationCandidate => {
                    if (request.kind !== 'yaml-blocks') fail('REPRESENTATION_UNSUPPORTED','This document supports the common YAML block representation.');
                    const owner = ownerOf(project), record = owner.documents[documentId];
                    if (!record || record.id !== documentId || record.source !== source) fail('PROJECT_CONFLICT','The source document changed.');
                    const state = readDocumentViewMetadata(owner, reference), active = state?.activeKind || 'source';
                    let root = locate(project, reference);
                    if (request.direction === 'from-source' && active === 'yaml-blocks') {
                        if (!root) fail('DOCUMENT_VIEW_ROOT_INVALID','The active source reference hat is missing.');
                        const descriptor = state!.descriptors['yaml-blocks'] as YamlViewDescriptor | undefined;
                        if (!descriptor || descriptor.rootOpcode !== rootOpcode || encodeReference(descriptor.reference) !== encodeReference(reference) || !descriptor.opcodes || Object.keys(descriptor.opcodes).length !== Object.keys(opcodes).length || Object.entries(opcodes).some(([name, opcode]) => descriptor.opcodes[name as keyof YamlBlockOpcodes] !== opcode)) fail('DOCUMENT_VIEW_METADATA_INVALID','The active block representation does not match this document.');
                        const syntax = parseSourceSyntax(source,{format:record.format});
                        const result = readYamlSourceBlockView({baseline:syntax.baseline,blocks:root.target.blocks,descriptor,sourceRevision:record.revision});
                        const owned = subtree(root.target,root,descriptor.opcodes);
                        if (result.source === source) return {project,source,summary:`Save YAML blocks in ${record.filename}`};
                        if ([...owned].some(id=>root.target.blocks[id]!.comment) || Object.values(root.target.comments || {}).some(comment=>owned.has(comment.blockId as string))) fail('DOCUMENT_VIEW_COMMENT_UNSUPPORTED','Keep standard comments before regenerating an edited YAML block view.');
                        const reflected = buildCandidate({project,source,request:{kind:'yaml-blocks',direction:'to-source'}});
                        const rebuilt = buildCandidate({project:reflected.project,source:reflected.source,request:{kind:'yaml-blocks',direction:'from-source'}});
                        return {...rebuilt,summary:`Save YAML blocks in ${record.filename}`};
                    }
                    if (request.direction === 'from-source') {
                        if (active !== 'source') fail('DOCUMENT_VIEW_ACTIVE','Reflect the active block representation into source first.');
                        if (root?.block.next) fail('DOCUMENT_VIEW_OCCUPIED','The source hat already owns a body; it will not be replaced.');
                        const stages = project.targets.filter(target => target.isStage);
                        if (!root && stages.length !== 1) fail('DOCUMENT_VIEW_ROOT_INVALID','One Stage is required to create a source reference hat.');
                        const target = root?.target || stages[0]!;target.blocks ||= {};
                        const ids = new Set(project.targets.flatMap(t => Object.keys(t.blocks || {})));
                        let serial = 1; while ([...ids].some(id => id.startsWith(`document-view-${serial}-`))) serial++;
                        const prefix = `document-view-${serial}-`, rootId = root?.id || `${prefix}hat`;
                        const view = createYamlSourceBlockView({source,format:record.format,sourceRevision:record.revision,reference,rootId,rootOpcode,opcodes,idPrefix:prefix,x:root?.block.x ?? 32,y:root?.block.y ?? 32});
                        // The existing hat keeps all of its own fields and position.
                        if (root) view.blocks[rootId] = {...root.block, next:view.blocks[rootId]!.next} as YamlViewBlock;
                        Object.assign(target.blocks, view.blocks);
                        writeDocumentViewMetadata(owner, reference, {activeKind:'yaml-blocks',descriptors:{...(state?.descriptors || {}),'yaml-blocks':view.descriptor}});
                        companion(project, companionURL);
                        return {project,source,summary:`Show ${record.filename} as YAML blocks`};
                    }
                    if (request.direction !== 'to-source' || active !== 'yaml-blocks' || !root) fail('DOCUMENT_VIEW_INACTIVE','No active YAML block representation exists for this document.');
                    const descriptor = state!.descriptors['yaml-blocks'] as YamlViewDescriptor | undefined;
                    if (!descriptor || descriptor.rootOpcode !== rootOpcode || encodeReference(descriptor.reference) !== encodeReference(reference)) fail('DOCUMENT_VIEW_METADATA_INVALID','The active block representation does not match this document.');
                    if (!descriptor.opcodes || Object.keys(descriptor.opcodes).length !== Object.keys(opcodes).length || Object.entries(opcodes).some(([name, opcode]) => descriptor.opcodes[name as keyof YamlBlockOpcodes] !== opcode)) fail('DOCUMENT_VIEW_METADATA_INVALID','The active view uses unknown block declarations.');
                    const syntax = parseSourceSyntax(source,{format:record.format});
                    const result = readYamlSourceBlockView({baseline:syntax.baseline,blocks:root.target.blocks,descriptor,sourceRevision:record.revision});
                    const owned = subtree(root.target,root,descriptor.opcodes);
                    for (const id of owned) delete root.target.blocks[id];
                    root.block.next = null;
                    if (result.source !== source) {
                        const revision = Number(record.revision);
                        if (!Number.isSafeInteger(revision) || revision < 1 || revision >= 999999999999999) fail('DOCUMENT_REVISION_LIMIT','The source revision cannot be incremented.');
                        owner.documents[documentId] = {...record,source:result.source,revision:String(revision+1)};
                    }
                    writeDocumentViewMetadata(owner,reference,{activeKind:'source',descriptors:{...(state!.descriptors || {}),'yaml-blocks':{...clone(descriptor),baseSourceRevision:owner.documents[documentId]!.revision}}});
                    return {project,source:result.source,summary:`Reflect YAML blocks into ${record.filename}`};
            };
            const previewGraph = (project: Project) => {
                const root = locate(project,reference);
                if(!root)fail('DOCUMENT_VIEW_ROOT_INVALID','The preview document root is missing.');
                const ids = subtree(root.target,root,opcodes);ids.add(root.id);
                for(const id of referencesFrom({...root.block,next:null})) {
                    const shadow=root.target.blocks[id];
                    if(!shadow?.shadow || shadow.next || Object.keys(shadow.inputs||{}).length)fail('DOCUMENT_VIEW_GRAPH_INVALID','The document reference must be literal.');
                    ids.add(id);
                }
                const blocks=Object.fromEntries([...ids].map(id=>[id,clone(root.target.blocks[id]!)]));
                blocks[root.id]!.x=24;blocks[root.id]!.y=24;
                return {blocks,rootIds:[root.id]};
            };
            const previewProject = (project: Project): Project => ({
                ...project,
                targets:project.targets.map(target=>({...target,blocks:Object.fromEntries(Object.entries(target.blocks || {}).map(([id,block])=>[id,{...block}]))})),
                extensionStorage:{...project.extensionStorage,[sourceDocumentStorageId]:{...ownerOf(project),documents:{...ownerOf(project).documents},...(ownerOf(project).editorViews?{editorViews:clone(ownerOf(project).editorViews)}:{})}},
                extensions:[...(project.extensions || [])],extensionURLs:{...(project.extensionURLs || {})}
            });
            const buildPreviewArtifact = ({project,source,kind}: {project: Project; source: string; kind: string}) => {
                if(!['source','yaml-blocks'].includes(kind))fail('REPRESENTATION_UNSUPPORTED','This owner does not provide a schema-specific block preview.');
                project=previewProject(project);
                const active=activeKind(ownerOf(project),reference);
                const request: RepresentationRequest | null=kind==='yaml-blocks'?{kind:'yaml-blocks',direction:'from-source'}:active==='source'?null:{kind:active,direction:'to-source'};
                const candidate=request?buildCandidate({project,source,request}):null;
                if(candidate){project=candidate.project;source=candidate.source;}
                if(kind==='source')return {preview:{kind,source},...(candidate?{candidate:{...candidate,request:request!}}:{})};
                const graph=previewGraph(project);
                const filename=ownerOf(project).documents[documentId]!.filename;
                const rootDefinition=createEmbeddedYamlHatDefinition({BlockType:{HAT:'hat'},operation:'sourceDocument',menuName:'sourceDocuments',defaultReference:reference});
                const blockDefinitions=[{...rootDefinition,opcode:rootOpcode,text:'embedded document [DOCUMENT]',colour:'#9a7037'},...createYamlBlockDefinitions().map(definition=>({...definition,opcode:opcodes[(Object.keys(yamlBlockOperations) as (keyof typeof yamlBlockOperations)[]).find(key=>yamlBlockOperations[key]===definition.opcode)!]!,colour:'#9a7037'}))];
                // Document Data normalizes and validates the complete preview model.
                const preview = {kind,source,...graph,blockDefinitions,menus:{...createYamlBlockMenus(),sourceDocuments:{acceptReporters:false,items:[{text:filename,value:encodeReference(reference)}]}}} as unknown as SourceDocumentPreview;
                return {preview,...(candidate?{candidate:{...candidate,request:request!}}:{})};
            };
            const wrapped = createProjectRepresentationAdapter({vm, adapter, reference,buildCandidate,buildPreviewArtifact});
            const guarded = Object.freeze({...wrapped,
                prepare(snapshot: Parameters<typeof wrapped.prepare>[0],source: string) {requireSource(reference);return wrapped.prepare(snapshot,source);},
                commit(snapshot: Parameters<typeof wrapped.commit>[0],candidate: Parameters<typeof wrapped.commit>[1]) {requireSource(reference);return wrapped.commit(snapshot,candidate);},
                dispose() {opened.delete(guarded);wrapped.dispose();}
            });
            opened.add(guarded); return guarded;
        },
        dispose() {if(disposed)return;disposed=true;for(const adapter of [...opened])adapter.dispose();store.dispose();base.dispose();}
    });
}
