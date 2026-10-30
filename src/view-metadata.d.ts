import type { SourceDocumentReference } from '@kubohiroya/turbowarp-document-data/composition';
export interface DocumentViewState {
    activeKind: string;
    descriptors: Record<string, unknown>;
}
export function readDocumentViewMetadata(
    owner: Record<string, unknown>,
    reference: SourceDocumentReference
): DocumentViewState | null;
export function writeDocumentViewMetadata(
    owner: Record<string, unknown>,
    reference: SourceDocumentReference,
    state: DocumentViewState
): DocumentViewState;
export function removeDocumentViewMetadata(
    owner: Record<string, unknown>,
    reference: SourceDocumentReference
): boolean;
