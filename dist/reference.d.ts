import { SourceDocumentError, encodeSourceDocumentReference as encodeReference, decodeSourceDocumentReference as decodeReference, type SourceDocumentReference } from '@kubohiroya/turbowarp-document-data/composition';
export { SourceDocumentError as EmbeddedYamlError, encodeReference, decodeReference };
/** A VM, ScratchBlocks or serialized SB3 block; only its literal DOCUMENT data is read. */
export interface ReferenceBlock {
    getFieldValue?(name: string): unknown;
    getInputTargetBlock?(name: string): ReferenceBlock | null | undefined;
    isShadow?(): boolean;
    shadow?: unknown;
    fields?: Record<string, unknown>;
    inputs?: Record<string, unknown>;
}
/** The target owning serialized shadows: a VM block container or a serialized block dictionary. */
export interface ReferenceTarget {
    blocks?: {
        getBlock?(id: string): ReferenceBlock | null | undefined;
    } | Record<string, unknown>;
}
export declare function fail(code: string, message: string): never;
export declare function identifier(value: unknown, name: string): string;
/** Read direct dropdown fields and legacy literal shadows without evaluating expressions. */
export declare function readReference(block: unknown, target?: unknown): SourceDocumentReference;
