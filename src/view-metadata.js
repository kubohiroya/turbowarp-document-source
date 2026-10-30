import { encodeReference, fail } from './reference.js';
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const invalid = (message) => fail('DOCUMENT_VIEW_METADATA_INVALID', message);
const clone = (value) => {
    const seen = new Set();
    let nodes = 0;
    const copy = (value, depth) => {
        if (++nodes > 250000 || depth > 80) invalid('View metadata exceeds its structural limit.');
        if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (!value || typeof value !== 'object' || seen.has(value))
            invalid('View metadata must be finite JSON.');
        if (
            !Array.isArray(value) &&
            ![Object.prototype, null].includes(Object.getPrototypeOf(value))
        )
            invalid('View metadata must use plain JSON objects.');
        if (Object.getOwnPropertySymbols(value).length)
            invalid('View metadata cannot contain symbols.');
        const properties = Object.getOwnPropertyDescriptors(value);
        if (
            Array.isArray(value) &&
            (Object.keys(properties).length !== value.length + 1 ||
                Object.keys(properties)
                    .filter((key) => key !== 'length')
                    .some((key, index) => key !== String(index)))
        )
            invalid('View metadata arrays cannot have holes or custom properties.');
        seen.add(value);
        const result = Array.isArray(value) ? [] : {};
        for (const [key, property] of Object.entries(properties)) {
            if (Array.isArray(value) && key === 'length') continue;
            if (!Object.hasOwn(property, 'value') || !property.enumerable)
                invalid('View metadata cannot contain accessors or hidden properties.');
            Object.defineProperty(result, key, {
                value: copy(property.value, depth + 1),
                enumerable: true,
                writable: true,
                configurable: true
            });
        }
        seen.delete(value);
        return result;
    };
    const result = copy(value, 0);
    if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 8 * 1024 * 1024)
        invalid('View metadata exceeds its byte limit.');
    return result;
};
const validateState = (state) => {
    if (
        !record(state) ||
        typeof state.activeKind !== 'string' ||
        !state.activeKind ||
        !record(state.descriptors)
    )
        invalid('A representation state requires activeKind and descriptors.');
    return clone(state);
};
function container(owner) {
    if (!record(owner)) invalid('An owner storage object is required.');
    const value = owner.editorViews;
    if (value === undefined) return null;
    if (!record(value) || value.version !== 1 || !record(value.views))
        invalid('The owner has incompatible view metadata.');
    return value;
}
/** Derived metadata stays inside the actual source owner's serialized storage. */
export function readDocumentViewMetadata(owner, reference) {
    const state = container(owner)?.views[encodeReference(reference)];
    return state === undefined ? null : validateState(state);
}
/** Mutates only the caller-owned candidate storage object, never source text. */
export function writeDocumentViewMetadata(owner, reference, state) {
    const copy = validateState(state),
        key = encodeReference(reference),
        current = container(owner);
    if (!current) owner.editorViews = { version: 1, views: {} };
    Object.defineProperty(owner.editorViews.views, key, {
        value: copy,
        enumerable: true,
        writable: true,
        configurable: true
    });
    return clone(copy);
}
export function removeDocumentViewMetadata(owner, reference) {
    const current = container(owner),
        key = encodeReference(reference);
    if (!current || !Object.hasOwn(current.views, key)) return false;
    delete current.views[key];
    return true;
}
