import test from 'node:test';
import assert from 'node:assert/strict';
import {
    readDocumentViewMetadata,
    writeDocumentViewMetadata,
    removeDocumentViewMetadata
} from '../src/view-metadata.js';
const ref = { providerId: 'owner', documentId: 'main' };
test('view metadata is stored beside canonical owner source and remains isolated across document refs', () => {
    const owner = { source: 'unchanged', assets: [1] };
    const first = {
        activeKind: 'yaml-blocks',
        descriptors: {
            'yaml-blocks': { version: 2, rootOpcode: 'owner_hat', syntaxIdsByPath: { $: 'node:0' } }
        }
    };
    writeDocumentViewMetadata(owner, ref, first);
    writeDocumentViewMetadata(
        owner,
        { ...ref, documentId: 'second' },
        { activeKind: 'source', descriptors: {} }
    );
    assert.equal(owner.source, 'unchanged');
    assert.deepEqual(owner.assets, [1]);
    assert.deepEqual(readDocumentViewMetadata(JSON.parse(JSON.stringify(owner)), ref), first);
    const copy = readDocumentViewMetadata(owner, ref);
    copy.activeKind = 'changed';
    assert.equal(readDocumentViewMetadata(owner, ref).activeKind, 'yaml-blocks');
    assert.equal(removeDocumentViewMetadata(owner, ref), true);
    assert.equal(removeDocumentViewMetadata(owner, ref), false);
    assert.equal(
        readDocumentViewMetadata(owner, { ...ref, documentId: 'second' }).activeKind,
        'source'
    );
});
test('unknown metadata versions and cyclic payloads are refused instead of overwriting owner data', () => {
    const invalid = { editorViews: { version: 99, views: {} } };
    assert.throws(
        () => writeDocumentViewMetadata(invalid, ref, { activeKind: 'source', descriptors: {} }),
        (e) => e.code === 'DOCUMENT_VIEW_METADATA_INVALID'
    );
    assert.equal(invalid.editorViews.version, 99);
    const cyclic = {};
    cyclic.self = cyclic;
    assert.throws(
        () =>
            writeDocumentViewMetadata({}, ref, { activeKind: 'yaml-blocks', descriptors: cyclic }),
        (e) => e.code === 'DOCUMENT_VIEW_METADATA_INVALID'
    );
});
