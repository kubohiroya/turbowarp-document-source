import type { SourceDocumentReference, RegisteredSourceDocumentMetadata, SourceDocumentSnapshot, SourceDocumentAdapter, SourceDocumentProvider, SourceDocumentRegistry } from './types.ts';
export type DocumentSourceKind = 'embedded-file' | 'url' | 'yaml-blocks' | 'schema-blocks';
export interface DocumentSourceInput {
    readonly kind: DocumentSourceKind;
    readonly filename: string;
    readonly format?: 'yaml' | 'json' | undefined;
    readonly url?: string | undefined;
}
export type DocumentSource = Readonly<DocumentSourceInput & {
    location: 'sb3' | 'https';
    representation: 'source' | 'yaml-blocks' | 'schema-blocks';
    format: 'yaml' | 'json';
}>;
export interface DocumentSourceURLEntry {
    readonly reference: SourceDocumentReference;
    readonly url: string;
    readonly ownerExtensionId: string;
}
export interface FetchDocumentSourceOptions {
    fetch: typeof fetch;
    signal?: AbortSignal | undefined;
    maxBytes?: number;
    timeoutMs?: number;
}
export interface DataSourceCandidate {
    readonly source: string;
    readonly dataSource: DocumentSource;
}
export interface DocumentSourceAdapter extends SourceDocumentAdapter {
    loadSource(): Promise<void>;
    prepareDataSource?(snapshot: SourceDocumentSnapshot, request: {
        kind: 'embedded-file' | 'url';
        url?: string;
    }): Promise<DataSourceCandidate>;
    commitDataSource?(snapshot: SourceDocumentSnapshot, candidate: DataSourceCandidate): {
        source: string;
    };
}
export interface DocumentSourceOwnerOptions {
    sourceStorageId?: string | ((project: Record<string, any>) => string);
    dialogTitle?: {
        readonly ja: string;
        readonly en: string;
    };
    fetch?: typeof fetch;
    buildSourceCandidate?(input: {
        project: Record<string, any>;
        reference: SourceDocumentReference;
        source: string;
    }): Promise<{
        project: Record<string, any>;
        source: string;
    }> | {
        project: Record<string, any>;
        source: string;
    };
}
export type DocumentSourceMetadata = RegisteredSourceDocumentMetadata & {
    dataSource: DocumentSource;
    sourceLocationEditable: boolean;
    dialogTitle?: {
        readonly ja: string;
        readonly en: string;
    };
};
export interface DocumentSourceRegistry extends Omit<SourceDocumentRegistry, 'register' | 'list' | 'open'> {
    register(provider: SourceDocumentProvider, options?: DocumentSourceOwnerOptions): () => void;
    list(): readonly DocumentSourceMetadata[];
    open(reference: SourceDocumentReference | string): DocumentSourceAdapter;
}
export declare const documentSourceStorageKey = "documentSourceLocations";
export declare const documentSourceModes: readonly DocumentSourceKind[];
export declare function normalizeDocumentSourceURL(value: unknown): string;
/** Location and representation are independent; URL sources have a text representation. */
export declare function normalizeDocumentSource(input: DocumentSourceInput): DocumentSource;
