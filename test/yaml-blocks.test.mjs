import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    yamlBlockIconURI,
    embeddedYamlFileIconURI,
    createEmbeddedYamlHatDefinition,
} from '../index.js';
import {
    createYamlBlockDefinitions,
    createYamlBlockView,
    readYamlBlockView,
    createYamlBlockOpcodes,
} from '../src/yaml-blocks.js';
import { createYamlBlockRuntime } from '../src/runtime.js';
const ref = { providerId: 'owner', documentId: 'main' };
const comment = (id, text) => ({ id, kind: 'comment', text });
const scalar = (id, value) => ({ id, kind: 'scalar', value });
const tree = {
    id: 'map',
    kind: 'map',
    comments: { before: [comment('doc-comment', 'Header')] },
    entries: [
        {
            id: 'pair',
            kind: 'pair',
            key: scalar('key', 'message'),
            value: {
                ...scalar('value', 'hello'),
                comments: { inline: [comment('inline', 'inline note')] },
            },
        },
        {
            id: 'list-pair',
            kind: 'pair',
            key: scalar('list-key', 'values'),
            value: {
                id: 'list',
                kind: 'sequence',
                items: [scalar('number', 42), scalar('bool', false), scalar('null', null)],
            },
        },
    ],
};
const make = () =>
    createYamlBlockView({
        reference: { providerId: 'owner', documentId: 'main' },
        tree,
        rootId: 'hat',
        rootOpcode: 'owner_embeddedYaml',
    });
test('derived maps, lists, typed values and comments roundtrip without duplicating source', () => {
    const view = make();
    assert.deepEqual(readYamlBlockView(view), tree);
    assert(!JSON.stringify(view.descriptor).includes('hello'));
    assert.equal(
        Object.values(view.blocks).filter((b) =>
            [view.descriptor.opcodes.lineComment, view.descriptor.opcodes.inlineComment].includes(
                b.opcode,
            ),
        ).length,
        2,
    );
    const runtime = createYamlBlockRuntime({ BlockType: { HAT: 'hat' } }, { enabled: true });
    assert.equal(runtime.getInfo().id, 'kubohiroyaembeddedyaml');
    assert(runtime.getInfo().blocks.some((b) => b.opcode === 'yamlComment'));
    assert.equal(runtime.yamlMap(), false);
});
test('workspace literal edits retain node identity and scalar type', () => {
    const view = make();
    const value = Object.keys(view.blocks).find((id) => view.nodeIds[id] === 'value');
    view.blocks[value].inputs.VALUE[1][1] = 'edited';
    const read = readYamlBlockView(view);
    assert.equal(read.entries[0].value.id, 'value');
    assert.equal(read.entries[0].value.value, 'edited');
    assert.equal(read.entries[1].value.items[0].value, 42);
});
test('actual VM input objects and literal shadows are accepted without reporter evaluation', () => {
    const view = make();
    const value = Object.keys(view.blocks).find((id) => view.nodeIds[id] === 'value');
    view.blocks[value].inputs.VALUE = { block: 'shadow', shadow: 'shadow' };
    view.blocks.shadow = {
        opcode: 'text',
        shadow: true,
        fields: { TEXT: { value: 'from VM' } },
        parent: value,
    };
    assert.equal(readYamlBlockView(view).entries[0].value.value, 'from VM');
});
test('unknown blocks, reporters, cycles, invalid parent links and type mismatches fail closed', () => {
    for (const corrupt of [
        (v) => {
            v.blocks[v.blocks.hat.next].opcode = 'unknown';
        },
        (v) => {
            const id = Object.keys(v.blocks).find((id) => v.nodeIds[id] === 'value');
            v.blocks[id].inputs.VALUE = [3, 'reporter', [10, 'hidden']];
        },
        (v) => {
            const first = v.blocks.hat.next;
            v.blocks[first].next = first;
        },
        (v) => {
            v.blocks[v.blocks.hat.next].parent = 'other';
        },
        (v) => {
            const id = Object.keys(v.blocks).find((id) => v.nodeIds[id] === 'number');
            v.blocks[id].inputs.VALUE = [1, [10, 'NaN']];
        },
    ]) {
        const view = make();
        corrupt(view);
        assert.throws(
            () => readYamlBlockView(view),
            (e) => e.code === 'YAML_BLOCK_GRAPH_INVALID',
        );
    }
});
test('a view cannot silently change its document reference or reinterpret unsupported keys', () => {
    const view = make();
    view.blocks.hat.fields.DOCUMENT = ['tw-embedded-yaml:1:other:main', null];
    assert.throws(
        () => readYamlBlockView(view),
        (e) => e.code === 'YAML_BLOCK_GRAPH_INVALID',
    );
    assert.throws(
        () =>
            createYamlBlockView({
                reference: { providerId: 'owner', documentId: 'main' },
                tree: {
                    id: 'map',
                    kind: 'map',
                    entries: [
                        { id: 'p', kind: 'pair', key: scalar('k', 3), value: scalar('v', null) },
                    ],
                },
                rootId: 'hat',
                rootOpcode: 'owner_hat',
            }),
        (e) => e.code === 'YAML_BLOCK_GRAPH_INVALID',
    );
});
test('different owners choose their opcode namespace without hardcoded App dependencies', () => {
    const view = createYamlBlockView({
        reference: { providerId: 'another', documentId: 'main' },
        tree: scalar('value', 'text'),
        rootId: 'other',
        rootOpcode: 'another_document',
        opcodes: createYamlBlockOpcodes('another_'),
    });
    assert.equal(
        Object.values(view.blocks).find((b) => b.opcode === 'another_yamlScalar').inputs
            .VALUE[1][1],
        'text',
    );
    assert.deepEqual(readYamlBlockView(view), scalar('value', 'text'));
});

test('optimizer-renamed block IDs do not affect persisted view descriptors or subsequent edits', () => {
    const view = make();
    assert.equal(view.descriptor.rootId, undefined);
    assert.equal(view.descriptor.nodeIds, undefined);
    const ids = Object.keys(view.blocks),
        rename = Object.fromEntries(ids.map((id, index) => [id, 'short' + index]));
    const renamed = Object.fromEntries(
        Object.entries(view.blocks).map(([id, block]) => [
            rename[id],
            {
                ...block,
                parent: block.parent === null ? null : rename[block.parent],
                next: block.next === null ? null : rename[block.next],
                inputs: Object.fromEntries(
                    Object.entries(block.inputs).map(([name, input]) => [
                        name,
                        Array.isArray(input) && input[0] === 2 ? [2, rename[input[1]]] : input,
                    ]),
                ),
            },
        ]),
    );
    assert.deepEqual(
        readYamlBlockView({
            blocks: renamed,
            descriptor: JSON.parse(JSON.stringify(view.descriptor)),
        }),
        tree,
    );
    const valueId = rename[Object.keys(view.nodeIds).find((id) => view.nodeIds[id] === 'value')];
    renamed[valueId].inputs.VALUE[1][1] = 'saved edit';
    assert.equal(
        readYamlBlockView({ blocks: renamed, descriptor: view.descriptor }).entries[0].value.value,
        'saved edit',
    );
});

test('the standalone runtime captures an explicit default-OFF startup option', () => {
    assert.equal(createYamlBlockRuntime({ BlockType: {} }).getInfo().blocks.length, 0);
    assert.equal(
        createYamlBlockRuntime({ BlockType: {} }, { enabled: true }).getInfo().blocks.length,
        10,
    );
});

test('multiline scalar values use explicit single-line text blocks and typed line endings', () => {
    for (const value of ['first\nsecond', '\n', 'first\n\nlast\n', 'a\r\nb\rc\n']) {
        const view = createYamlBlockView({
            reference: ref,
            tree: scalar('str', value),
            rootId: 'hat',
            rootOpcode: 'owner_hat',
        });
        assert.deepEqual(readYamlBlockView(view), scalar('str', value));
        const lines = Object.values(view.blocks).filter(
            (b) => b.opcode === view.descriptor.opcodes.textLine,
        );
        assert(lines.length >= 2);
        assert(lines.every((b) => !/[\r\n]/u.test(b.inputs.TEXT[1][1])));
        assert(
            !Object.values(view.blocks).some((b) => b.opcode === view.descriptor.opcodes.scalar),
        );
    }
});
test('legacy multiline scalar/comment text fields fail closed rather than silently flattening', () => {
    const view = createYamlBlockView({
        reference: ref,
        tree: scalar('str', 'one'),
        rootId: 'hat',
        rootOpcode: 'owner_hat',
    });
    Object.values(view.blocks).find(
        (b) => b.opcode === view.descriptor.opcodes.scalar,
    ).inputs.VALUE[1][1] = 'first\nsecond';
    assert.throws(
        () => readYamlBlockView(view),
        (e) => e.code === 'YAML_BLOCK_UNSUPPORTED',
    );
    assert.throws(() =>
        createYamlBlockView({
            reference: ref,
            tree: {
                ...scalar('str', 'one'),
                comments: { before: [comment('multi', 'first\nsecond')] },
            },
            rootId: 'hat',
            rootOpcode: 'owner_hat',
        }),
    );
});

test('all common declarations override the owner icon with the exact square YAML asset', async () => {
    const definitions = createYamlBlockDefinitions();
    assert.equal(definitions.length, 10);
    for (const declaration of definitions) {
        assert(Object.hasOwn(declaration, 'blockIconURI'));
        assert.equal(declaration.blockIconURI, yamlBlockIconURI);
    }
    assert(yamlBlockIconURI.startsWith('data:image/svg+xml,'));
    const svg = decodeURIComponent(yamlBlockIconURI.slice('data:image/svg+xml,'.length));
    assert.equal(
        svg,
        (await readFile(new URL('../assets/yaml-block.svg', import.meta.url), 'utf8')).trim(),
    );
    assert.match(svg, /viewBox="0 0 48 48"/u);
    assert.match(svg, /width="42" height="42"/u);
    assert.match(svg, />YAML<\/text>/u);
    assert.notEqual(yamlBlockIconURI, embeddedYamlFileIconURI);
    assert.equal(
        createEmbeddedYamlHatDefinition({ BlockType: { HAT: 'hat' }, defaultReference: ref })
            .blockIconURI,
        embeddedYamlFileIconURI,
    );
});
