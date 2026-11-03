const PREFIX = 'tw-embedded-yaml:1:';
export class SourceDocumentError extends Error {
    code;
    constructor(code, message) { super(message); this.name = 'SourceDocumentError'; this.code = code; }
}
export function fail(code, message) { throw new SourceDocumentError(code, message); }
export const hasControlCharacters = (value) => Array.from(value).some(character => { const code = character.codePointAt(0); return code < 32 || code === 127; });
export const identifier = (value, name) => {
    if (typeof value !== 'string' || !value.length || value.length > 1024 || hasControlCharacters(value)) {
        fail('REFERENCE_INVALID', `${name} must be a bounded nonempty identifier.`);
    }
    return value;
};
export function encodeSourceDocumentReference(reference) {
    if (!reference || typeof reference !== 'object')
        fail('REFERENCE_INVALID', 'A document reference is required.');
    const providerId = identifier(reference.providerId, 'providerId');
    const documentId = identifier(reference.documentId, 'documentId');
    try {
        return `${PREFIX}${encodeURIComponent(providerId)}:${encodeURIComponent(documentId)}`;
    }
    catch {
        return fail('REFERENCE_INVALID', 'The reference contains invalid Unicode.');
    }
}
export function decodeSourceDocumentReference(value) {
    if (typeof value !== 'string' || value.length > 8192 || !value.startsWith(PREFIX))
        fail('REFERENCE_INVALID', 'The block does not contain a valid source document reference.');
    const parts = value.slice(PREFIX.length).split(':');
    if (parts.length !== 2)
        fail('REFERENCE_INVALID', 'The source document reference is malformed.');
    let reference;
    try {
        reference = { providerId: decodeURIComponent(parts[0]), documentId: decodeURIComponent(parts[1]) };
    }
    catch {
        return fail('REFERENCE_INVALID', 'The source document reference encoding is invalid.');
    }
    if (encodeSourceDocumentReference(reference) !== value)
        fail('REFERENCE_INVALID', 'The source document reference is not canonical.');
    return Object.freeze(reference);
}
