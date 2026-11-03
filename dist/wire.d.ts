import type { SourceDocumentReference } from './types.ts';
export type { SourceDocumentReference } from './types.ts';
export declare class SourceDocumentError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
export declare function fail(code: string, message: string): never;
export declare const hasControlCharacters: (value: string) => boolean;
export declare const identifier: (value: unknown, name: string) => string;
export declare function encodeSourceDocumentReference(reference: SourceDocumentReference): string;
export declare function decodeSourceDocumentReference(value: string): SourceDocumentReference;
