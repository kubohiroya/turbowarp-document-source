import {
    SourceDocumentError,
    encodeSourceDocumentReference as encodeReference,
    decodeSourceDocumentReference as decodeReference
} from '@kubohiroya/turbowarp-document-data/composition';
export {SourceDocumentError as EmbeddedYamlError, encodeReference, decodeReference};
// These assertions apply only to hat and marker inputs; reference validation is canonical.
export const fail = (code, message) => { throw new SourceDocumentError(code, message); };
export const identifier = (value, name) => {
    if (typeof value !== 'string' || !value.length || value.length > 1024 || /[\u0000-\u001f\u007f]/u.test(value)) {
        fail('REFERENCE_INVALID', `${name} must be a bounded nonempty identifier.`);
    }
    return value;
};
const fieldValue = field => Array.isArray(field) ? field[0] : field && typeof field === 'object' ? field.value : field;
const literalField = block => {
    if (typeof block?.getFieldValue === 'function') {
        const direct = block.getFieldValue('DOCUMENT');
        if (direct !== null && direct !== undefined) return direct;
    }
    if (block?.fields && Object.hasOwn(block.fields, 'DOCUMENT')) return fieldValue(block.fields.DOCUMENT);
    return undefined;
};
const shadowValue = shadow => {
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
/** Read direct dropdown fields and legacy literal shadows without evaluating expressions. */
export function readReference(block, target) {
    const direct = literalField(block);
    if (direct !== undefined) return decodeReference(direct);
    if (typeof block?.getInputTargetBlock === 'function') return decodeReference(shadowValue(block.getInputTargetBlock('DOCUMENT')));
    const input = block?.inputs?.DOCUMENT;
    if (!input) fail('REFERENCE_INVALID', 'The block has no DOCUMENT reference.');
    if (Array.isArray(input)) {
        if (input[0] !== 1) fail('REFERENCE_REPORTER', 'Document references cannot be supplied by reporters.');
        if (Array.isArray(input[1]) && input[1][0] === 10) return decodeReference(input[1][1]);
    } else if (!input.shadow || input.block !== input.shadow) {
        fail('REFERENCE_REPORTER', 'Document references cannot be supplied by reporters.');
    }
    const id = Array.isArray(input) ? input[1] : input.shadow;
    const blocks = target?.blocks;
    const shadow = typeof blocks?.getBlock === 'function' ? blocks.getBlock(id) : blocks?.[id];
    return decodeReference(shadowValue(shadow));
}
