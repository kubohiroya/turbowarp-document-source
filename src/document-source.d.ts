import type {SourceDocumentReference, RegisteredSourceDocumentMetadata, SourceDocumentSnapshot, SourceDocumentAdapter, SourceDocumentProvider, SourceDocumentRegistry} from '@kubohiroya/turbowarp-document-data/composition';
export type DocumentSourceKind = 'embedded-file' | 'url' | 'yaml-blocks' | 'schema-blocks';
export interface DocumentSourceInput {readonly kind: DocumentSourceKind; readonly filename: string; readonly format?: 'yaml'|'json'; readonly url?: string;}
export type DocumentSource = Readonly<DocumentSourceInput & {location:'sb3'|'https';representation:'source'|'yaml-blocks'|'schema-blocks';format:'yaml'|'json'}>;
export const documentSourceStorageKey: 'documentSourceLocations';
export const documentSourceModes: readonly DocumentSourceKind[];
export function normalizeDocumentSourceURL(value: unknown): string;
export function normalizeDocumentSource(input: DocumentSourceInput): DocumentSource;
export function readDocumentSourceURLs(project: unknown): readonly {readonly reference: SourceDocumentReference;readonly url: string;readonly ownerExtensionId:string}[];
export function writeDocumentSourceURL(project: Record<string, any>, reference: SourceDocumentReference, url: string|null, ownerExtensionId:string): void;
export function fetchDocumentSource(url: string, options: {fetch: typeof fetch;signal?: AbortSignal;maxBytes?: number;timeoutMs?: number}): Promise<{readonly source:string;readonly url:string}>;
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
export interface DocumentSourceRegistry extends Omit<SourceDocumentRegistry,'register'|'list'|'open'> {
 register(provider:SourceDocumentProvider,options?:DocumentSourceOwnerOptions):()=>void;
 list(): readonly (RegisteredSourceDocumentMetadata & {dataSource:DocumentSource;sourceLocationEditable:boolean;dialogTitle?:{readonly ja:string;readonly en:string}})[];
 open(reference:SourceDocumentReference|string):DocumentSourceAdapter;
}
export function getDocumentSourceRegistry(vm:any):DocumentSourceRegistry;
