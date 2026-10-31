import type { SourceDocumentReference } from '@kubohiroya/turbowarp-document-data/composition';
export interface DocumentViewState {
    activeKind: string;
    descriptors: Record<string, unknown>;
}
/** Derived metadata stays inside the actual source owner's serialized storage. */
export declare function readDocumentViewMetadata(owner: Record<string, unknown>, reference: SourceDocumentReference): DocumentViewState | null;
/** Mutates only the caller-owned candidate storage object, never source text. */
export declare function writeDocumentViewMetadata(owner: Record<string, unknown>, reference: SourceDocumentReference, state: DocumentViewState): DocumentViewState;
export declare function removeDocumentViewMetadata(owner: Record<string, unknown>, reference: SourceDocumentReference): boolean;
