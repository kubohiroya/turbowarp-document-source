import type { SourceDocumentSchemaMetadata } from './types.ts';
export declare const sourceDocumentSchemaLimits: Readonly<{
    maxBytes: number;
    maxDepth: 64;
    maxNodes: 100000;
}>;
/** Copy finite JSON without invoking accessors or serialization hooks. This does not interpret JSON Schema. */
export declare function normalizeSourceDocumentSchema(metadata: unknown): SourceDocumentSchemaMetadata;
