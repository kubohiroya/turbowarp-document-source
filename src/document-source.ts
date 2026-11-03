import type {SourceDocumentReference, RegisteredSourceDocumentMetadata, SourceDocumentSnapshot, SourceDocumentAdapter, SourceDocumentProvider, SourceDocumentRegistry} from './types.ts';
import {fail} from './reference.ts';
import {validateEmbeddedYamlRelativePath} from './filename.ts';
export type DocumentSourceKind = 'embedded-file' | 'url' | 'yaml-blocks' | 'schema-blocks';
export interface DocumentSourceInput {readonly kind: DocumentSourceKind; readonly filename: string; readonly format?: 'yaml'|'json' | undefined; readonly url?: string | undefined;}
export type DocumentSource = Readonly<DocumentSourceInput & {location:'sb3'|'https';representation:'source'|'yaml-blocks'|'schema-blocks';format:'yaml'|'json'}>;
export interface DocumentSourceURLEntry {readonly reference: SourceDocumentReference;readonly url: string;readonly ownerExtensionId:string}
export interface FetchDocumentSourceOptions {fetch: typeof fetch;signal?: AbortSignal | undefined;maxBytes?: number;timeoutMs?: number}
export interface DataSourceCandidate {readonly source:string;readonly dataSource:DocumentSource;}
export interface DocumentSourceAdapter extends SourceDocumentAdapter {
 loadSource():Promise<void>;
 prepareDataSource?(snapshot: SourceDocumentSnapshot, request: {kind:'embedded-file'|'url';url?:string}):Promise<DataSourceCandidate>;
 commitDataSource?(snapshot: SourceDocumentSnapshot, candidate:DataSourceCandidate):{source:string};
}
export interface DocumentSourceOwnerOptions {
 sourceStorageId?: string | ((project:Record<string,any>)=>string);
 dialogTitle?: {readonly ja:string;readonly en:string};
 fetch?: typeof fetch;
 buildSourceCandidate?(input:{project:Record<string,any>;reference:SourceDocumentReference;source:string}): Promise<{project:Record<string,any>;source:string}> | {project:Record<string,any>;source:string};
}
export type DocumentSourceMetadata = RegisteredSourceDocumentMetadata & {dataSource:DocumentSource;sourceLocationEditable:boolean;dialogTitle?:{readonly ja:string;readonly en:string}};
export interface DocumentSourceRegistry extends Omit<SourceDocumentRegistry,'register'|'list'|'open'> {
 register(provider:SourceDocumentProvider,options?:DocumentSourceOwnerOptions):()=>void;
 list(): readonly DocumentSourceMetadata[];
 open(reference:SourceDocumentReference|string):DocumentSourceAdapter;
}

export const documentSourceStorageKey = 'documentSourceLocations';
export const documentSourceModes: readonly DocumentSourceKind[] = Object.freeze(['embedded-file', 'url', 'yaml-blocks', 'schema-blocks']);
const object = (value: unknown): value is Record<string, any> => value !== null && typeof value === 'object' && !Array.isArray(value);
export function normalizeDocumentSourceURL(value: unknown): string {
    if (typeof value !== 'string' || !value || value.length > 4096 || /[\u0000-\u0020\u007f]/u.test(value)) fail('SOURCE_URL_INVALID', 'A bounded HTTPS URL is required.');
    let url: URL;
    try { url = new URL(value); } catch { fail('SOURCE_URL_INVALID', 'An absolute HTTPS URL is required.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) fail('SOURCE_URL_INVALID', 'Use HTTPS without credentials or a fragment.');
    return url.href;
}

/** Location and representation are independent; URL sources have a text representation. */
export function normalizeDocumentSource(input: DocumentSourceInput): DocumentSource {
    if (!object(input) || !documentSourceModes.includes(input.kind)) fail('SOURCE_KIND_INVALID', 'An explicit document source kind is required.');
    const filename = validateEmbeddedYamlRelativePath(input.filename);
    const format = input.format ?? 'yaml';
    if (!['yaml', 'json'].includes(format)) fail('SOURCE_FORMAT_INVALID', 'The text format must be YAML or JSON.');
    return Object.freeze({kind: input.kind, filename, format,
        location: input.kind === 'url' ? 'https' : 'sb3',
        representation: input.kind === 'embedded-file' || input.kind === 'url' ? 'source' : input.kind,
        ...(input.kind === 'url' ? {url: normalizeDocumentSourceURL(input.url)} : {})});
}
