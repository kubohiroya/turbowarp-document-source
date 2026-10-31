import {encodeReference, decodeReference, fail} from './reference.js';
import {validateEmbeddedYamlRelativePath} from './filename.js';

export const documentSourceStorageKey = 'documentSourceLocations';
export const documentSourceModes = Object.freeze(['embedded-file', 'url', 'yaml-blocks', 'schema-blocks']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const textEncoder = new TextEncoder();

export function normalizeDocumentSourceURL(value) {
    if (typeof value !== 'string' || !value || value.length > 4096 || /[\u0000-\u0020\u007f]/u.test(value)) fail('SOURCE_URL_INVALID', 'A bounded HTTPS URL is required.');
    let url;
    try { url = new URL(value); } catch { fail('SOURCE_URL_INVALID', 'An absolute HTTPS URL is required.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) fail('SOURCE_URL_INVALID', 'Use HTTPS without credentials or a fragment.');
    return url.href;
}

/** Location and representation are independent; URL sources have a text representation. */
export function normalizeDocumentSource(input) {
    if (!object(input) || !documentSourceModes.includes(input.kind)) fail('SOURCE_KIND_INVALID', 'An explicit document source kind is required.');
    const filename = validateEmbeddedYamlRelativePath(input.filename);
    const format = input.format ?? 'yaml';
    if (!['yaml', 'json'].includes(format)) fail('SOURCE_FORMAT_INVALID', 'The text format must be YAML or JSON.');
    return Object.freeze({kind: input.kind, filename, format,
        location: input.kind === 'url' ? 'https' : 'sb3',
        representation: ['embedded-file', 'url'].includes(input.kind) ? 'source' : input.kind,
        ...(input.kind === 'url' ? {url: normalizeDocumentSourceURL(input.url)} : {})});
}

/** Read persistent locations only. Owner view state remains the authority for block forms. */
export function readDocumentSourceURLs(project) {
    const result = [], seen = new Set();
    for (const [ownerExtensionId, owner] of Object.entries(project?.extensionStorage || {})) {
        if (!object(owner) || !Object.hasOwn(owner, documentSourceStorageKey)) continue;
        const state = owner[documentSourceStorageKey];
        if (!object(state) || state.formatVersion !== 1 || !object(state.urls) || Object.keys(state.urls).length > 256) fail('SOURCE_STORAGE_INVALID', 'Invalid document source locations.');
        for (const [key, value] of Object.entries(state.urls)) {
            if (seen.has(key)) fail('SOURCE_STORAGE_INVALID', 'A document cannot have URL locations in multiple owners.');
            seen.add(key);
            if (!object(value) || Object.keys(value).some(name => name !== 'url')) fail('SOURCE_STORAGE_INVALID', 'Invalid URL source record.');
            result.push(Object.freeze({reference: decodeReference(key), url: normalizeDocumentSourceURL(value.url), ownerExtensionId}));
        }
    }
    return Object.freeze(result);
}

/** Persist inside a loaded owner extension so standard SB3 serialization retains it. */
export function writeDocumentSourceURL(project, reference, url, ownerExtensionId) {
    if (typeof ownerExtensionId !== 'string' || !ownerExtensionId || !object(project?.extensionStorage?.[ownerExtensionId])) fail('SOURCE_STORAGE_INVALID', 'An existing owner extension storage ID is required.');
    const all = readDocumentSourceURLs(project), key = encodeReference(reference);
    if (all.some(entry => encodeReference(entry.reference) === key && entry.ownerExtensionId !== ownerExtensionId)) fail('SOURCE_STORAGE_INVALID', 'The document URL belongs to another extension storage.');
    const entries = new Map(all.filter(entry => entry.ownerExtensionId === ownerExtensionId).map(entry => [encodeReference(entry.reference), {url: entry.url}]));
    if (url === null) entries.delete(key);
    else entries.set(key, {url: normalizeDocumentSourceURL(url)});
    if (entries.size > 256) fail('SOURCE_STORAGE_INVALID', 'Too many URL sources.');
    const owner = project.extensionStorage[ownerExtensionId];
    if (!entries.size) delete owner[documentSourceStorageKey];
    else owner[documentSourceStorageKey] = {formatVersion: 1, urls: Object.fromEntries(entries)};
}

/** Fetch only on explicit demand. Never send ambient credentials or write back remotely. */
export async function fetchDocumentSource(url, options = {}) {
    const fetcher = options.fetch;
    const {signal, maxBytes = 1024 * 1024, timeoutMs = 15000} = options;
    const href = normalizeDocumentSourceURL(url);
    if (typeof fetcher !== 'function' || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 16 * 1024 * 1024 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new TypeError('A fetch function and bounded limits are required.');
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, {once: true});
    const timer = setTimeout(() => controller.abort(new Error('Source request timed out.')), timeoutMs);
    let reader;
    try {
        const response = await fetcher(href, {signal: controller.signal, credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer'});
        if (controller.signal.aborted) throw controller.signal.reason;
        if (!response.ok || response.redirected) fail('SOURCE_FETCH_FAILED', 'The source URL could not be loaded without a redirect.');
        if (response.url && normalizeDocumentSourceURL(response.url) !== href) fail('SOURCE_FETCH_FAILED', 'The response URL does not match the requested source.');
        const length = response.headers?.get('content-length');
        if (length && (!/^\d+$/u.test(length) || Number(length) > maxBytes)) fail('SOURCE_TOO_LARGE', 'The source exceeds its byte limit.');
        // Streams enforce the limit even when Content-Length is absent or incorrect.
        if (!response.body?.getReader) fail('SOURCE_FETCH_FAILED', 'A bounded readable response is required.');
        reader = response.body.getReader();
        const parts = [];
        let size = 0;
        while (true) {
            const chunk = await reader.read();
            if (controller.signal.aborted) throw controller.signal.reason;
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > maxBytes) fail('SOURCE_TOO_LARGE', 'The source exceeds its byte limit.');
            parts.push(chunk.value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
        let source;
        try { source = new TextDecoder('utf-8', {fatal: true}).decode(bytes); }
        catch { fail('SOURCE_ENCODING_INVALID', 'The source must be UTF-8 text.'); }
        if (textEncoder.encode(source).byteLength > maxBytes) fail('SOURCE_TOO_LARGE', 'The source exceeds its byte limit.');
        return Object.freeze({source, url: href});
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        try { await reader?.cancel(); } catch { /* Preserve the original outcome. */ }
        reader?.releaseLock();
    }
}
