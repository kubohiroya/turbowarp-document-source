import {fail} from './reference.ts';
const bytes = new TextEncoder();
/** Validate a portable basename without trimming, normalizing, or silently renaming it. */
export function validateEmbeddedYamlFilename(filename: string): string {
    if (typeof filename !== 'string' || !filename || filename.trim() !== filename || /[<>:"/\\|?*\u0000-\u001f\u007f-\u009f]/u.test(filename) || /[. ]$/u.test(filename) || filename === '.' || filename === '..' || Array.from(filename).some(char => {const n=char.codePointAt(0)!;return n >= 0xd800 && n <= 0xdfff;}) || bytes.encode(filename).length > 255 || /^(?:con|prn|aux|nul|clock\$|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(filename)) {
        fail('DOCUMENT_FILENAME_INVALID', 'A nonempty portable filename is required; enter a valid name without path separators.');
    }
    return filename;
}
/** Validate an already normalized relative POSIX path; basename validation remains separate. */
export function validateEmbeddedYamlRelativePath(path: string): string {
    if (typeof path !== 'string' || !path || path.length > 1000 || path.startsWith('/') || path.includes('\\')) fail('DOCUMENT_PATH_INVALID', 'A bounded relative POSIX path is required.');
    const parts = path.split('/');
    if (parts.some(part => !part || part === '.' || part === '..')) fail('DOCUMENT_PATH_INVALID', 'Document paths cannot contain empty, dot, or parent segments.');
    for (const part of parts) validateEmbeddedYamlFilename(part);
    return path;
}
