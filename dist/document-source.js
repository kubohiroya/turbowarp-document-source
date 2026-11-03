import { fail } from "./reference.js";
import { validateEmbeddedYamlRelativePath } from "./filename.js";
export const documentSourceStorageKey = 'documentSourceLocations';
export const documentSourceModes = Object.freeze(['embedded-file', 'url', 'yaml-blocks', 'schema-blocks']);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
export function normalizeDocumentSourceURL(value) {
    if (typeof value !== 'string' || !value || value.length > 4096 || /[\u0000-\u0020\u007f]/u.test(value))
        fail('SOURCE_URL_INVALID', 'A bounded HTTPS URL is required.');
    let url;
    try {
        url = new URL(value);
    }
    catch {
        fail('SOURCE_URL_INVALID', 'An absolute HTTPS URL is required.');
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.hash)
        fail('SOURCE_URL_INVALID', 'Use HTTPS without credentials or a fragment.');
    return url.href;
}
/** Location and representation are independent; URL sources have a text representation. */
export function normalizeDocumentSource(input) {
    if (!object(input) || !documentSourceModes.includes(input.kind))
        fail('SOURCE_KIND_INVALID', 'An explicit document source kind is required.');
    const filename = validateEmbeddedYamlRelativePath(input.filename);
    const format = input.format ?? 'yaml';
    if (!['yaml', 'json'].includes(format))
        fail('SOURCE_FORMAT_INVALID', 'The text format must be YAML or JSON.');
    return Object.freeze({ kind: input.kind, filename, format,
        location: input.kind === 'url' ? 'https' : 'sb3',
        representation: input.kind === 'embedded-file' || input.kind === 'url' ? 'source' : input.kind,
        ...(input.kind === 'url' ? { url: normalizeDocumentSourceURL(input.url) } : {}) });
}
