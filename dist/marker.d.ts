import type { SourceDocumentReference } from '@kubohiroya/turbowarp-document-data/composition';
export interface EmbeddedYamlMarkerOptions {
    readonly opcode: string;
    readonly reference: SourceDocumentReference;
    readonly x?: number;
    readonly y?: number;
}
export interface EmbeddedYamlRootMarkerOptions extends EmbeddedYamlMarkerOptions {
    readonly version: string;
}
/** A serialized SB3 block holding only literal references. */
export type EmbeddedYamlMarkerBlock = {
    opcode: string;
    next: null;
    parent: null;
    inputs: Record<string, never>;
    fields: {
        DOCUMENT: [string, null];
        VERSION?: [string, null];
    };
    shadow: false;
    topLevel: true;
    x: number;
    y: number;
};
export declare function createEmbeddedYamlMarker({ opcode, reference, x, y }: EmbeddedYamlMarkerOptions): EmbeddedYamlMarkerBlock;
/** Install a reference only; document eligibility and storage remain the owner's responsibility. */
export declare function installEmbeddedYamlMarker(project: Record<string, unknown>, options: EmbeddedYamlMarkerOptions): string;
export declare function removeEmbeddedYamlMarkers(project: Record<string, unknown>, { opcodes }: {
    readonly opcodes: readonly string[];
}): number;
/** Validate a root reference without repairing connected blocks or changing the project. */
export declare function validateEmbeddedYamlRootMarker(block: unknown, { opcode, target }?: {
    readonly opcode?: string;
    readonly target?: unknown;
}): SourceDocumentReference;
export declare function readEmbeddedYamlRootVersion(block: unknown): string;
export declare function createEmbeddedYamlRootMarker(options: EmbeddedYamlRootMarkerOptions): EmbeddedYamlMarkerBlock;
/** Install one Stage entry reference; changing an existing entry requires explicit owner handling. */
export declare function installEmbeddedYamlRootMarker(project: Record<string, unknown>, options: EmbeddedYamlRootMarkerOptions): string;
