import type { SourceDocumentPreview } from './types.ts';
/** Copy finite declarative JSON only; no project archives, owner payloads or executable callbacks. */
export declare function normalizeSourceDocumentPreview(model: unknown, requestedKind: string): SourceDocumentPreview;
