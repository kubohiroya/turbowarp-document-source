import { fail, identifier } from "./wire.js";
export const sourceDocumentSchemaLimits = Object.freeze({ maxBytes: 1024 * 1024, maxDepth: 64, maxNodes: 100000 });
/** Copy finite JSON without invoking accessors or serialization hooks. This does not interpret JSON Schema. */
export function normalizeSourceDocumentSchema(metadata) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
        fail('SCHEMA_INVALID', 'Inline schema metadata must be an object.');
    const properties = Object.getOwnPropertyDescriptors(metadata);
    if (!properties.id || !Object.hasOwn(properties.id, 'value') || !properties.schema || !Object.hasOwn(properties.schema, 'value') || Object.keys(properties).some(key => key !== 'id' && key !== 'schema'))
        fail('SCHEMA_INVALID', 'Inline schema metadata requires only id and schema.');
    const id = identifier(properties.id.value, 'schema id');
    const root = properties.schema.value;
    if (!root || typeof root !== 'object' || Array.isArray(root))
        fail('SCHEMA_INVALID', 'An inline JSON Schema object is required.');
    const path = new Set();
    let nodes = 0, characters = 0;
    const clone = (value, depth) => {
        if (++nodes > sourceDocumentSchemaLimits.maxNodes || depth > sourceDocumentSchemaLimits.maxDepth)
            fail('SCHEMA_LIMIT', 'The inline schema is too deeply nested or has too many values.');
        if (value === null || typeof value === 'boolean')
            return value;
        if (typeof value === 'number') {
            if (!Number.isFinite(value))
                fail('SCHEMA_INVALID', 'Schema numbers must be finite.');
            return value;
        }
        if (typeof value === 'string') {
            characters += value.length;
            if (characters > sourceDocumentSchemaLimits.maxBytes)
                fail('SCHEMA_LIMIT', 'The inline schema exceeds its size limit.');
            return value;
        }
        if (!value || typeof value !== 'object')
            fail('SCHEMA_INVALID', 'Schemas must contain only JSON values.');
        if (path.has(value))
            fail('SCHEMA_INVALID', 'Cyclic schema payloads are unsupported.');
        if (Object.getOwnPropertySymbols(value).length)
            fail('SCHEMA_INVALID', 'Schemas cannot contain symbol properties.');
        const prototype = Object.getPrototypeOf(value);
        if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null)
            fail('SCHEMA_INVALID', 'Schemas must use plain JSON objects.');
        path.add(value);
        const result = Array.isArray(value) ? [] : {};
        const properties = Object.getOwnPropertyDescriptors(value);
        if (Array.isArray(value) && (value.length > sourceDocumentSchemaLimits.maxNodes || Object.keys(properties).filter(key => key !== 'length').some((key, index) => key !== String(index)) || Object.keys(properties).length !== value.length + 1))
            fail('SCHEMA_INVALID', 'Schema arrays must not contain holes or custom properties.');
        for (const [key, property] of Object.entries(properties)) {
            if (Array.isArray(value) && key === 'length')
                continue;
            if (!Object.hasOwn(property, 'value') || !property.enumerable)
                fail('SCHEMA_INVALID', 'Schema payloads cannot contain accessors or hidden properties.');
            characters += key.length;
            if (characters > sourceDocumentSchemaLimits.maxBytes)
                fail('SCHEMA_LIMIT', 'The inline schema exceeds its size limit.');
            Object.defineProperty(result, key, { value: clone(property.value, depth + 1), enumerable: true, writable: false, configurable: false });
        }
        path.delete(value);
        return Object.freeze(result);
    };
    const schema = clone(root, 0);
    const result = Object.freeze({ id, schema });
    if (new globalThis.TextEncoder().encode(JSON.stringify(result)).byteLength > sourceDocumentSchemaLimits.maxBytes)
        fail('SCHEMA_LIMIT', 'The inline schema exceeds its UTF-8 size limit.');
    return result;
}
