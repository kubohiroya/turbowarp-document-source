import { SourceDocumentError, identifier } from "./wire.js";
function fail(message) { throw new SourceDocumentError('DOCUMENT_PREVIEW_INVALID', message); }
const plain = (value) => value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
/** Copy finite declarative JSON only; no project archives, owner payloads or executable callbacks. */
export function normalizeSourceDocumentPreview(model, requestedKind) {
    identifier(requestedKind, 'preview representation kind');
    if (!plain(model))
        fail('A declarative document preview is required.');
    const allowed = new Set(['kind', 'source', 'blocks', 'rootIds', 'blockDefinitions', 'menus']);
    if (Object.keys(model).some(key => !allowed.has(key)))
        fail('A preview cannot contain project, archive or asset payloads.');
    const ancestors = new Set();
    let nodes = 0, bytes = 0;
    const copy = (value, depth = 0) => {
        if (++nodes > 500000 || depth > 80)
            fail('The document preview exceeds its structural limit.');
        if (value === null || typeof value === 'boolean')
            return value;
        if (typeof value === 'number') {
            if (!Number.isFinite(value))
                fail('Preview numbers must be finite.');
            return value;
        }
        if (typeof value === 'string') {
            bytes += new TextEncoder().encode(value).byteLength;
            if (bytes > 8 * 1024 * 1024)
                fail('The document preview exceeds its byte limit.');
            return value;
        }
        if (!value || typeof value !== 'object' || ancestors.has(value) || (!Array.isArray(value) && !plain(value)))
            fail('Preview data must be finite plain JSON without callbacks.');
        if (Object.getOwnPropertySymbols(value).length)
            fail('Preview JSON cannot contain symbols.');
        const properties = Object.getOwnPropertyDescriptors(value), array = Array.isArray(value), result = array ? [] : {};
        if (array && (!Number.isSafeInteger(value.length) || Object.keys(properties).length !== value.length + 1))
            fail('Preview arrays cannot contain holes or custom fields.');
        ancestors.add(value);
        for (const [key, descriptor] of Object.entries(properties)) {
            if (array && key === 'length')
                continue;
            if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable)
                fail('Preview JSON cannot contain accessors or hidden fields.');
            bytes += new TextEncoder().encode(key).byteLength;
            if (bytes > 8 * 1024 * 1024)
                fail('The document preview exceeds its byte limit.');
            Object.defineProperty(result, key, { value: copy(descriptor.value, depth + 1), enumerable: true });
        }
        ancestors.delete(value);
        return Object.freeze(result);
    };
    const result = copy(model);
    if (result.kind !== requestedKind || typeof result.source !== 'string')
        fail('A preview must identify the requested kind and its source.');
    if (result.blocks !== undefined && (!plain(result.blocks) || Object.keys(result.blocks).length > 100000 || Object.values(result.blocks).some((block) => !plain(block) || typeof block.opcode !== 'string')))
        fail('Preview blocks must be a bounded serialized block dictionary.');
    if (result.rootIds !== undefined && (!Array.isArray(result.rootIds) || result.rootIds.length > 256 || new Set(result.rootIds).size !== result.rootIds.length || result.rootIds.some((id) => typeof id !== 'string' || !Object.hasOwn(result.blocks || {}, id))))
        fail('Preview roots must identify distinct included blocks.');
    if (result.blockDefinitions !== undefined) {
        if (!Array.isArray(result.blockDefinitions) || result.blockDefinitions.length > 4096)
            fail('Preview block definitions must be a bounded array.');
        const seen = new Set();
        for (const definition of result.blockDefinitions) {
            if (!plain(definition) || typeof definition.opcode !== 'string' || !definition.opcode || definition.opcode.length > 1024 || seen.has(definition.opcode) || typeof definition.blockType !== 'string' || !(typeof definition.text === 'string' || Array.isArray(definition.text) && definition.text.every((text) => typeof text === 'string')))
                fail('Preview definitions require distinct full opcodes and declarative labels.');
            if (definition.blockIconURI !== undefined) {
                if (typeof definition.blockIconURI !== 'string')
                    fail('A preview block icon must be an image URI.');
                let uri;
                try {
                    uri = new URL(definition.blockIconURI, 'https://preview.invalid/');
                }
                catch {
                    fail('A preview block icon URI is invalid.');
                }
                if (!['http:', 'https:', 'data:'].includes(uri.protocol) || uri.protocol === 'data:' && !/^data:image\//iu.test(definition.blockIconURI))
                    fail('A preview cannot include executable icon URIs.');
            }
            seen.add(definition.opcode);
        }
    }
    if (result.menus !== undefined && (!plain(result.menus) || Object.values(result.menus).some((menu) => !plain(menu) || !Array.isArray(menu.items))))
        fail('Preview menus must contain static item arrays.');
    if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 8 * 1024 * 1024)
        fail('The serialized preview exceeds its byte limit.');
    return result;
}
