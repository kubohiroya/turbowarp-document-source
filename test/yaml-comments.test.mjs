import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createYamlBlockDefinitions,
    createYamlBlockMenus,
    createYamlBlockOpcodes,
    createYamlBlockView,
    readYamlBlockView,
} from '../src/yaml-blocks.js';
import { createYamlSourceBlockView, readYamlSourceBlockView } from '../src/yaml-source-view.js';
import { parseSourceSyntax } from '@kubohiroya/turbowarp-yaml-json/source-syntax';
const reference = { providerId: 'owner', documentId: 'comments' };
const source =
    '\ufeff# 同じ行\r\n# 同じ行\r\nmessage: "hello" # 行末の全文 # 次の印も本文\r\n#\r\n# 末尾\r\n';
const make = () =>
    createYamlSourceBlockView({
        source,
        reference,
        rootId: 'hat',
        rootOpcode: 'owner_embeddedYaml',
    });
test('visible line and inline comments have distinct declarations; the old mixed declaration remains hidden', () => {
    const defs = createYamlBlockDefinitions(),
        menus = createYamlBlockMenus();
    const line = defs.find((d) => d.opcode === 'yamlLineComment'),
        inline = defs.find((d) => d.opcode === 'yamlInlineComment'),
        legacy = defs.find((d) => d.opcode === 'yamlComment');
    assert.equal(line.text, 'YAML line comment [PLACEMENT] [TEXT]');
    assert.equal(line.hideFromPalette, undefined);
    assert.equal(inline.text, 'YAML inline comment [TEXT]');
    assert.deepEqual(Object.keys(inline.arguments), ['TEXT']);
    assert.equal(legacy.hideFromPalette, true);
    assert.deepEqual(menus.yamlLineCommentPlacements.items, ['before', 'after']);
    assert.deepEqual(menus.yamlCommentPlacements.items, ['before', 'inline', 'after']);
    assert.equal(menus.yamlLineCommentPlacements.acceptReporters, false);
});
test('physical line comments and inline text preserve all post-hash text, repeated identities, BOM and CRLF', () => {
    const view = make(),
        ops = view.descriptor.opcodes,
        blocks = Object.entries(view.blocks);
    assert.equal(
        blocks.some(([, b]) => b.opcode === ops.comment),
        false,
    );
    const line = blocks.filter(([, b]) => b.opcode === ops.lineComment),
        inline = blocks.filter(([, b]) => b.opcode === ops.inlineComment);
    assert.equal(inline.length, 1);
    assert.equal(inline[0][1].inputs.TEXT[1][1], ' 行末の全文 # 次の印も本文');
    assert.deepEqual(inline[0][1].fields, {});
    const repeated = line.filter(([, b]) => b.inputs.TEXT[1][1] === ' 同じ行');
    assert.equal(repeated.length, 2);
    assert.notEqual(view.nodeIds[repeated[0][0]], view.nodeIds[repeated[1][0]]);
    assert(line.some(([, b]) => b.inputs.TEXT[1][1].trim() === '')); // yaml's empty-comment sentinel is preserved by the codec.
    for (const [, block] of line) assert(['before', 'after'].includes(block.fields.PLACEMENT[0]));
    assert.equal(readYamlSourceBlockView(view).source, source);
    assert.deepEqual(readYamlBlockView(view), parseSourceSyntax(source).tree);
    const again = make();
    assert.deepEqual(again.descriptor.syntaxIdsByPath, view.descriptor.syntaxIdsByPath);
});
test('editing either comment kind retains its placement, repeated comments, quotes and native line endings', () => {
    const view = make(),
        ops = view.descriptor.opcodes;
    const line = Object.values(view.blocks).find(
        (b) => b.opcode === ops.lineComment && b.inputs.TEXT[1][1] === ' 同じ行',
    );
    const inline = Object.values(view.blocks).find((b) => b.opcode === ops.inlineComment);
    line.inputs.TEXT[1][1] = ' 編集した行 # 日本語';
    inline.inputs.TEXT[1][1] = ' 編集した行末';
    const output = readYamlSourceBlockView(view).source;
    assert(output.startsWith('\ufeff# 編集した行 # 日本語\r\n# 同じ行\r\n'));
    assert(output.includes('message: "hello" # 編集した行末\r\n'));
    assert(output.includes('#\r\n# 末尾\r\n'));
    assert(!output.replaceAll('\r\n', '').includes('\n'));
});
test('legacy mixed comment blocks and old custom opcode maps still roundtrip all placements', () => {
    const view = make(),
        ops = view.descriptor.opcodes;
    for (const block of Object.values(view.blocks)) {
        if (block.opcode === ops.lineComment) block.opcode = ops.comment;
        else if (block.opcode === ops.inlineComment) {
            block.opcode = ops.comment;
            block.fields.PLACEMENT = ['inline', null];
        }
    }
    delete ops.lineComment;
    delete ops.inlineComment;
    assert.equal(readYamlSourceBlockView(view).source, source);
    const oldOps = { ...createYamlBlockOpcodes() };
    delete oldOps.lineComment;
    delete oldOps.inlineComment;
    const tree = parseSourceSyntax(source).tree;
    const legacy = createYamlBlockView({
        reference,
        tree,
        rootId: 'hat',
        rootOpcode: 'owner_embeddedYaml',
        opcodes: oldOps,
    });
    assert.deepEqual(readYamlBlockView(legacy), tree);
    assert(Object.values(legacy.blocks).some((b) => b.opcode === oldOps.comment));
});
test('comment text is exactly one physical line and line comments cannot masquerade as inline comments', () => {
    for (const opcodeKey of ['lineComment', 'inlineComment']) {
        const view = make();
        const block = Object.values(view.blocks).find(
            (b) => b.opcode === view.descriptor.opcodes[opcodeKey],
        );
        block.inputs.TEXT[1][1] = 'one\ntwo';
        assert.throws(() => readYamlBlockView(view), { code: 'YAML_BLOCK_UNSUPPORTED' });
    }
    const badPlacement = make();
    Object.values(badPlacement.blocks).find(
        (b) => b.opcode === badPlacement.descriptor.opcodes.lineComment,
    ).fields.PLACEMENT[0] = 'inline';
    assert.throws(() => readYamlBlockView(badPlacement), { code: 'YAML_BLOCK_GRAPH_INVALID' });
    const extra = make();
    Object.values(extra.blocks).find(
        (b) => b.opcode === extra.descriptor.opcodes.inlineComment,
    ).fields.PLACEMENT = ['after', null];
    assert.throws(() => readYamlBlockView(extra), { code: 'YAML_BLOCK_GRAPH_INVALID' });
});

test('an explicitly empty comment node remains an empty text field and keeps its stable identity', () => {
    const tree = {
        id: 'value',
        kind: 'scalar',
        value: 1,
        comments: { before: [{ id: 'empty-comment', kind: 'comment', text: '' }] },
    };
    const view = createYamlBlockView({
        reference,
        tree,
        rootId: 'hat',
        rootOpcode: 'owner_embeddedYaml',
    });
    const note = Object.entries(view.blocks).find(
        ([, b]) => b.opcode === view.descriptor.opcodes.lineComment,
    );
    assert.equal(note[1].inputs.TEXT[1][1], '');
    assert.equal(view.nodeIds[note[0]], 'empty-comment');
    assert.deepEqual(readYamlBlockView(view), tree);
});
