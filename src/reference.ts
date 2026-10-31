import {
    SourceDocumentError,
    encodeSourceDocumentReference as encodeReference,
    decodeSourceDocumentReference as decodeReference,
    type SourceDocumentReference
} from '@kubohiroya/turbowarp-document-data/composition';
export {SourceDocumentError as EmbeddedYamlError, encodeReference, decodeReference};
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
    blocks?: {getBlock?(id: string): ReferenceBlock | null | undefined} | Record<string, unknown>;
}
// These assertions apply only to hat and marker inputs; reference validation is canonical.
export function fail(code: string, message: string): never { throw new SourceDocumentError(code, message); }
export function identifier(value: unknown, name: string): string {
    if (typeof value !== 'string' || !value.length || value.length > 1024 || /[\u0000-\u001f\u007f]/u.test(value)) {
        fail('REFERENCE_INVALID', `${name} must be a bounded nonempty identifier.`);
    }
    return value;
}
const fieldValue = (field: unknown): unknown => Array.isArray(field) ? field[0] : field && typeof field === 'object' ? (field as {value?: unknown}).value : field;
const literalField = (block: ReferenceBlock | null | undefined): unknown => {
    if (typeof block?.getFieldValue === 'function') {
        const direct = block.getFieldValue('DOCUMENT');
        if (direct !== null && direct !== undefined) return direct;
    }
    if (block?.fields && Object.hasOwn(block.fields, 'DOCUMENT')) return fieldValue(block.fields.DOCUMENT);
    return undefined;
};
const shadowValue = (shadow: ReferenceBlock | null | undefined): unknown => {
    if (!shadow) fail('REFERENCE_INVALID', 'The document reference shadow is missing.');
    const isShadow = typeof shadow.isShadow === 'function' ? shadow.isShadow() : shadow.shadow === true;
    if (!isShadow) fail('REFERENCE_REPORTER', 'Document references cannot be supplied by reporters.');
    const direct = literalField(shadow);
    if (direct !== undefined) return direct;
    if (typeof shadow.getFieldValue === 'function') {
        const text = shadow.getFieldValue('TEXT');
        if (text !== null && text !== undefined) return text;
    }
    const fields = Object.values(shadow.fields || {});
    if (fields.length !== 1) fail('REFERENCE_INVALID', 'A literal document reference is required.');
    return fieldValue(fields[0]);
};
// The canonical decoder validates every literal, including non-string values.
const decode = (value: unknown): SourceDocumentReference => decodeReference(value as string);
/** Read direct dropdown fields and legacy literal shadows without evaluating expressions. */
export function readReference(block: unknown, target?: unknown): SourceDocumentReference {
    const source = block as ReferenceBlock | null | undefined;
    const direct = literalField(source);
    if (direct !== undefined) return decode(direct);
    if (typeof source?.getInputTargetBlock === 'function') return decode(shadowValue(source.getInputTargetBlock('DOCUMENT')));
    const input = source?.inputs?.DOCUMENT as unknown[] | {block?: unknown; shadow?: unknown} | undefined;
    if (!input) fail('REFERENCE_INVALID', 'The block has no DOCUMENT reference.');
    if (Array.isArray(input)) {
        if (input[0] !== 1) fail('REFERENCE_REPORTER', 'Document references cannot be supplied by reporters.');
        if (Array.isArray(input[1]) && input[1][0] === 10) return decode(input[1][1]);
    } else if (!input.shadow || input.block !== input.shadow) {
        fail('REFERENCE_REPORTER', 'Document references cannot be supplied by reporters.');
    }
    const id = (Array.isArray(input) ? input[1] : input.shadow) as string;
    const blocks = (target as ReferenceTarget | null | undefined)?.blocks;
    const shadow = typeof blocks?.getBlock === 'function' ? blocks.getBlock(id) : (blocks as Record<string, ReferenceBlock> | undefined)?.[id];
    return decode(shadowValue(shadow));
}
