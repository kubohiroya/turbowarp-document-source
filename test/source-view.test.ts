import test from 'node:test';
import assert from 'node:assert/strict';
import { createYamlSourceBlockView, readYamlSourceBlockView } from '../src/yaml-source-view.ts';
import { parseValue } from '@kubohiroya/turbowarp-yaml-json/codec';
/** Tests edit generated SB3 blocks freely, so blocks are loose serialized records. */
type MutableSourceView = Omit<ReturnType<typeof createYamlSourceBlockView>, 'blocks'> & {
    blocks: Record<string, Record<string, any>>;
};
const reference = { providerId: 'source-owner', documentId: 'main' };
const make = (source: string, format: 'yaml' | 'json' = 'yaml'): MutableSourceView =>
    createYamlSourceBlockView({
        source,
        format,
        reference,
        rootId: 'hat',
        rootOpcode: 'owner_embeddedYaml',
        sourceRevision: '7',
    });
const read = (view: MutableSourceView) => readYamlSourceBlockView({ ...view, sourceRevision: '7' });
const samples = [
    '# header\r\nmessage: "Hello" # greeting\r\nvalues:\r\n  - 42\r\n  - false\r\n  - null\r\n# footer\r\n',
    'a: [1, 2]\nb: {c: "text"}\n',
    '# before document\n---\na: 1 # inline\n...\n# after document\n',
    '# first\n# second\n- "a" # inline\n\n# before second\n- true\n# trailing\n',
    'a:\n  # nested comment\n  b: 1\n',
    '{}\n',
    '[]\n',
    'null\n',
];
test('source to common blocks and back preserves unchanged YAML bytes, quotes, comments and CRLF', () => {
    for (const source of samples) {
        const view = make(source);
        assert.equal(read(view).source, source);
        assert(!JSON.stringify(view.descriptor).includes('Hello'));
    }
});
test('CST-backed edits retain comments and native line endings while changing typed values', () => {
    const view = make(samples[0]);
    const scalar = Object.values(view.blocks).find(
        (b) => b.opcode === view.descriptor.opcodes.scalar && b.inputs.VALUE[1][1] === 'Hello',
    )!;
    scalar.inputs.VALUE[1][1] = 'Edited';
    const result = read(view);
    assert.equal(
        (parseValue(result.source, 'yaml').value as Record<string, unknown>).message,
        'Edited',
    );
    assert.deepEqual(
        (parseValue(result.source, 'yaml').value as Record<string, unknown>).values,
        [42, false, null],
    );
    assert(result.source.includes('# greeting'));
    assert(result.source.includes('# footer'));
    assert(result.source.includes('# header'));
    assert(result.source.includes('\r\n'));
    assert(!result.source.replaceAll('\r\n', '').includes('\n'));
});
test('key, list structure and comment edits use the shared syntax emitter', () => {
    const view = make(samples[0]);
    const pair = Object.values(view.blocks).find(
        (b) => b.opcode === view.descriptor.opcodes.pair && b.inputs.KEY[1][1] === 'message',
    )!;
    pair.inputs.KEY[1][1] = 'caption';
    const note = Object.values(view.blocks).find(
        (b) =>
            b.opcode === view.descriptor.opcodes.inlineComment &&
            b.inputs.TEXT[1][1].includes('greeting'),
    )!;
    note.inputs.TEXT[1][1] = ' changed note';
    const list = Object.entries(view.blocks).find(
        ([, b]) => b.opcode === view.descriptor.opcodes.sequence,
    )!;
    let tail = list[1].inputs.SUBSTACK[1];
    while (view.blocks[tail].next) tail = view.blocks[tail].next;
    view.blocks[tail].next = 'new-item';
    view.blocks['new-item'] = {
        opcode: view.descriptor.opcodes.item,
        parent: tail,
        next: null,
        inputs: { SUBSTACK: [2, 'new-value'] },
        fields: {},
        shadow: false,
        topLevel: false,
    };
    view.blocks['new-value'] = {
        opcode: view.descriptor.opcodes.scalar,
        parent: 'new-item',
        next: null,
        inputs: { VALUE: [1, [10, 'added']] },
        fields: { TYPE: ['string', null] },
        shadow: false,
        topLevel: false,
    };
    const result = read(view);
    assert.deepEqual(parseValue(result.source, 'yaml').value, {
        caption: 'Hello',
        values: [42, false, null, 'added'],
    });
    assert(result.source.includes('# changed note'));
});
test('JSON uses the same typed graph without changing its native representation', () => {
    const source = '{\r\n  "message": "Hello",\r\n  "values": [42, false, null]\r\n}\r\n';
    const view = make(source, 'json');
    assert.equal(read(view).source, source);
    Object.values(view.blocks).find(
        (b) => b.opcode === view.descriptor.opcodes.scalar && b.inputs.VALUE[1][1] === 'Hello',
    )!.inputs.VALUE[1][1] = 'Changed';
    assert.equal(JSON.parse(read(view).source).message, 'Changed');
});
test('unsupported source syntax and stale canonical revisions fail without producing replacement source', () => {
    for (const source of ['a: &anchor 1\nb: *anchor\n', 'a: 1\na: 2\n', '? [a,b]\n: value\n'])
        assert.throws(() => make(source));
    const view = make(samples[0]);
    assert.throws(
        () => readYamlSourceBlockView({ ...view, sourceRevision: '8' }),
        (e: { code?: unknown }) => e.code === 'YAML_BLOCK_VIEW_STALE',
    );
    assert.equal(read(view).source, samples[0]);
});
