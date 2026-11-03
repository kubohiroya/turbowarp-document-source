export interface SourceDocumentRepresentation {
    readonly kind: string;
    readonly label: string;
    readonly fromSource: boolean;
    readonly toSource: boolean; /** Explicit active block kinds accepted by from-source, including this kind only when same-kind Save is supported. */
    readonly fromRepresentations?: readonly string[];
    readonly available?: boolean;
    readonly reason?: string;
}
export interface SourceDocumentRepresentationRequest {
    readonly kind: string;
    readonly direction: 'from-source' | 'to-source';
}
export interface SourceDocumentRepresentationCandidate {
    readonly summary: string;
}
export interface SourceDocumentSchemaMetadata {
    readonly id: string;
    readonly schema: Readonly<Record<string, unknown>>;
}
export interface SourceDocumentReference {
    readonly providerId: string;
    readonly documentId: string;
}
export interface SourceDocumentMetadata {
    readonly documentId: string;
    readonly filename: string;
    readonly representations?: readonly SourceDocumentRepresentation[];
    readonly activeRepresentation?: string;
    readonly docsURL?: string;
    readonly format?: 'yaml' | 'json';
    readonly available?: boolean;
    readonly reason?: string;
    readonly schema?: SourceDocumentSchemaMetadata;
}
export interface RegisteredSourceDocumentMetadata {
    readonly reference: SourceDocumentReference;
    readonly filename: string;
    readonly representations?: readonly SourceDocumentRepresentation[];
    readonly activeRepresentation?: string;
    readonly docsURL?: string;
    readonly format?: 'yaml' | 'json';
    readonly available?: boolean;
    readonly reason?: string;
    readonly schema?: SourceDocumentSchemaMetadata;
}
export interface SourceDocumentAvailability {
    readonly available: boolean;
    readonly reason?: string;
    readonly code?: string;
}
export interface SourceDocumentSnapshot {
    readonly source: string;
    readonly sourceName?: string;
}
export interface SourceDocumentPrepared {
    readonly source: string;
}
export type SourceDocumentPreviewJSON = null | boolean | number | string | readonly SourceDocumentPreviewJSON[] | {
    readonly [key: string]: SourceDocumentPreviewJSON;
};
export interface SourceDocumentPreviewBlockDefinition {
    readonly opcode: string;
    readonly blockType: string;
    readonly text: string | readonly string[];
    readonly arguments?: Readonly<Record<string, Readonly<Record<string, SourceDocumentPreviewJSON>>>>;
    readonly branchCount?: number;
    readonly colour?: string | number;
    readonly blockIconURI?: string;
}
export interface SourceDocumentPreview {
    readonly kind: string;
    readonly source: string;
    readonly blocks?: Readonly<Record<string, Readonly<Record<string, SourceDocumentPreviewJSON>>>>;
    readonly rootIds?: readonly string[];
    readonly blockDefinitions?: readonly SourceDocumentPreviewBlockDefinition[];
    readonly menus?: Readonly<Record<string, {
        readonly items: readonly SourceDocumentPreviewJSON[];
        readonly acceptReporters?: boolean;
    }>>;
}
export interface SourceDocumentAdapter {
    inspect(): SourceDocumentAvailability;
    capture(): SourceDocumentSnapshot;
    prepare(snapshot: SourceDocumentSnapshot, source: string): Promise<SourceDocumentPrepared>;
    commit(snapshot: SourceDocumentSnapshot, prepared: SourceDocumentPrepared): Promise<{
        source: string;
    }>;
    previewRepresentation?(snapshot: SourceDocumentSnapshot, request: {
        readonly kind: string;
    }): Promise<SourceDocumentPreview>;
    prepareRepresentation?(snapshot: SourceDocumentSnapshot, request: SourceDocumentRepresentationRequest): Promise<SourceDocumentRepresentationCandidate>;
    commitRepresentation?(snapshot: SourceDocumentSnapshot, candidate: SourceDocumentRepresentationCandidate): Promise<{
        source: string;
    }>;
    dispose(): void;
}
export interface SourceDocumentProvider {
    readonly id: string;
    readonly hatOpcodes?: readonly string[];
    list(): readonly SourceDocumentMetadata[];
    open(documentId: string): SourceDocumentAdapter;
    subscribe?(listener: () => void): () => void;
    dispose?(): void;
}
export interface SourceDocumentRegistry {
    readonly apiVersion: 1;
    readonly sourceDocumentApiVersion: 1;
    readonly disposed: boolean;
    register(provider: SourceDocumentProvider): () => void;
    list(): readonly RegisteredSourceDocumentMetadata[];
    open(reference: SourceDocumentReference | string): SourceDocumentAdapter;
    getHatOpcodes(): readonly string[];
    subscribe(listener: () => void): () => void;
    dispose(): void;
}
