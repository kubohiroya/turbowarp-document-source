import test from 'node:test';
import assert from 'node:assert/strict';
import {
    prepareProjectPatch,
    applyProjectPatch,
    canPatchProject,
    installProjectPatchWorkspaceAdapter,
} from '../src/project-patch.js';
const copy = (v) => structuredClone(v);
class Blocks {
    constructor(runtime) {
        this.runtime = runtime;
        this.map = new Map();
        this.scripts = [];
        this.forceNoGlow = false;
    }
    getBlock(id) {
        return this.map.get(id);
    }
    getScripts() {
        return this.scripts;
    }
    resetCache() {}
    createBlock(b) {
        if (this.map.has(b.id)) return;
        this.map.set(b.id, b);
        if (b.topLevel) this.scripts.push(b.id);
        if (!this.forceNoGlow) this.runtime.emitProjectChanged();
    }
    deleteBlock(id) {
        const b = this.map.get(id);
        if (!b) return;
        if (b.next) this.deleteBlock(b.next);
        for (const i of Object.values(b.inputs))
            for (const c of new Set([i.block, i.shadow])) if (c) this.deleteBlock(c);
        this.map.delete(id);
        this.scripts = this.scripts.filter((x) => x !== id);
        if (!this.forceNoGlow) this.runtime.emitProjectChanged();
    }
}
const block = (
    opcode,
    parent = null,
    next = null,
    inputs = {},
    fields = {},
    topLevel = parent === null,
) => ({ opcode, parent, next, inputs, fields, topLevel, shadow: false });
function fixture() {
    const counts = { stop: 0, save: 0, load: 0, dirty: 0, extensionLoads: 0 };
    const runtime = {
        targets: [],
        extensionStorage: {
            owner: {
                source: { text: '# 日本語\r\na: 1\r\n', revision: 1 },
                assets: { data: 'retained binary payload' },
                other: { retained: true },
            },
        },
        emitProjectChanged() {
            counts.dirty++;
        },
    };
    Object.defineProperty(runtime.extensionStorage, 'alias', {
        value: runtime.extensionStorage.owner,
        enumerable: false,
    });
    const target = {
        id: 'stage',
        name: 'Stage',
        isStage: true,
        isOriginal: true,
        blocks: new Blocks(runtime),
        comments: {},
        variables: { kept: { value: 7 } },
        costumes: [{ asset: 'identity' }],
        sounds: [{ sound: 'identity' }],
        createComment(id, blockId, text, x, y, width, height, minimized) {
            this.comments[id] = { id, blockId, text, x, y, width, height, minimized };
            if (blockId) this.blocks.getBlock(blockId).comment = id;
        },
    };
    runtime.targets.push(target);
    const base = {
        targets: [
            {
                isStage: true,
                name: 'Stage',
                blocks: {
                    hat: block('event_whenflagclicked', null, 'old'),
                    old: block('control_wait', 'hat', null, { DURATION: [1, [4, '1']] }),
                    other: block('event_whenflagclicked', null, 'untouched'),
                    untouched: block('control_wait', 'other', null, { DURATION: [1, [4, '8']] }),
                },
                comments: {},
                costumes: [{ assetId: 'unchanged' }],
                sounds: [],
                variables: { value: ['v', 7] },
            },
        ],
        extensionStorage: copy(runtime.extensionStorage),
        extensions: [],
    };
    for (const [id, b] of Object.entries(base.targets[0].blocks)) {
        const v = { ...copy(b), id, inputs: {} };
        if (b.inputs.DURATION) {
            const shadow = `${id}-shadow`;
            v.inputs.DURATION = { name: 'DURATION', block: shadow, shadow };
            target.blocks.createBlock({
                id: shadow,
                opcode: 'math_number',
                parent: id,
                next: null,
                shadow: true,
                topLevel: false,
                inputs: {},
                fields: { NUM: { name: 'NUM', value: b.inputs.DURATION[1][1] } },
            });
        }
        target.blocks.createBlock(v);
    }
    counts.dirty = 0;
    const candidate = {
        ...base,
        targets: [
            {
                ...base.targets[0],
                blocks: {
                    ...base.targets[0].blocks,
                    hat: { ...base.targets[0].blocks.hat, next: 'new' },
                    new: block('control_wait', 'hat', null, { DURATION: [1, [4, '2']] }),
                },
            },
        ],
        extensionStorage: {
            ...base.extensionStorage,
            owner: {
                ...base.extensionStorage.owner,
                source: { text: '# 日本語\r\na: 2\r\n', revision: 2 },
                editorViews: { activeKind: 'yaml-blocks' },
            },
        },
    };
    delete candidate.targets[0].blocks.old;
    const loaded = new Set(),
        functions = new Map();
    let current = true;
    const vm = {
        runtime,
        stopAll() {
            counts.stop++;
            throw Error('must not stop');
        },
        saveProjectSb3() {
            counts.save++;
            throw Error('must not save');
        },
        loadProject() {
            counts.load++;
            throw Error('must not load');
        },
        extensionManager: {
            isExtensionLoaded: (id) => loaded.has(id),
            isBuiltinExtension: () => false,
            async loadExtensionURL() {
                counts.extensionLoads++;
                loaded.add('added');
                functions.set('added_yamlMap', () => false);
            },
        },
        securityManager: {
            async canLoadExtensionFromProject() {
                return true;
            },
        },
    };
    runtime.getOpcodeFunction = (opcode) => functions.get(opcode);
    const assertCurrent = () => {
        if (!current) throw Object.assign(Error('stale'), { code: 'PROJECT_CONFLICT' });
    };
    return {
        vm,
        target,
        base,
        candidate,
        get baseProject() {
            return this.base;
        },
        get candidateProject() {
            return this.candidate;
        },
        counts,
        assertCurrent,
        stale() {
            current = false;
        },
    };
}
test('patch changes only affected graph and storage leaves; original root ID, unrelated identities, aliases and assets survive', async () => {
    const f = fixture(),
        assets = f.vm.runtime.extensionStorage.owner.assets,
        other = f.vm.runtime.extensionStorage.owner.other,
        alias = f.vm.runtime.extensionStorage.alias,
        unrelated = f.target.blocks.getBlock('untouched'),
        unrelatedShadow = f.target.blocks.getBlock('untouched-shadow'),
        variables = f.target.variables,
        costumes = f.target.costumes,
        sounds = f.target.sounds;
    const ui = [];
    installProjectPatchWorkspaceAdapter(f.vm, {
        prepare({ targetChanges }) {
            assert.deepEqual(targetChanges[0].beforeRootIds, ['hat']);
            assert.deepEqual(targetChanges[0].afterRootIds, ['hat']);
            return {
                apply() {
                    assert(f.target.blocks.getBlock('new'));
                    ui.push('apply');
                },
                rollback() {
                    ui.push('rollback');
                },
            };
        },
    });
    assert.equal(canPatchProject(f.vm), true);
    const token = await prepareProjectPatch(f);
    assert(f.target.blocks.getBlock('old'));
    assert.deepEqual(ui, []);
    assert.equal(f.counts.dirty, 0);
    const hatIdentity = f.target.blocks.getBlock('hat'),
        scriptOrder = f.target.blocks.getScripts().slice();
    const result = applyProjectPatch(token);
    assert.equal(f.target.blocks.getBlock('hat'), hatIdentity);
    assert.deepEqual(f.target.blocks.getScripts(), scriptOrder);
    assert.equal(result.projectPatched, true);
    assert.equal(f.target.blocks.getBlock('hat').next, 'new');
    assert.equal(f.target.blocks.getBlock('old'), undefined);
    assert.equal(f.target.blocks.getBlock('old-shadow'), undefined);
    assert.equal(f.target.blocks.getBlock('untouched'), unrelated);
    assert.equal(f.target.blocks.getBlock('untouched-shadow'), unrelatedShadow);
    assert.equal(f.target.variables, variables);
    assert.equal(f.target.costumes, costumes);
    assert.equal(f.target.sounds, sounds);
    assert.equal(f.vm.runtime.extensionStorage.owner.assets, assets);
    assert.equal(f.vm.runtime.extensionStorage.owner.other, other);
    assert.equal(f.vm.runtime.extensionStorage.alias, alias);
    assert.equal(
        Object.getOwnPropertyDescriptor(f.vm.runtime.extensionStorage, 'alias').enumerable,
        false,
    );
    assert.equal(f.vm.runtime.extensionStorage.owner.source.revision, 2);
    assert.deepEqual(f.vm.runtime.extensionStorage.owner.editorViews, {
        activeKind: 'yaml-blocks',
    });
    assert.deepEqual(ui, ['apply']);
    assert.equal(f.counts.dirty, 1);
    assert.deepEqual([f.counts.stop, f.counts.save, f.counts.load], [0, 0, 0]);
    assert.throws(() => applyProjectPatch(token), { code: 'PROJECT_PATCH_INVALID' });
});
test('unauthorized assets, variables, monitors, target reorder and extension removal are rejected before mutation', async () => {
    for (const mutate of [
        (p) => (p.targets[0].costumes = [{ assetId: 'changed' }]),
        (p) => (p.targets[0].variables = { x: ['x', 1] }),
        (p) => (p.monitors = [{ id: 'new' }]),
        (p) => (p.extensionStorage.owner.assets = { data: 'changed' }),
        (p) => (p.targets = []),
    ]) {
        const f = fixture();
        f.candidate = copy(f.candidate);
        mutate(f.candidate);
        await assert.rejects(prepareProjectPatch(f), { code: 'PROJECT_PATCH_UNSUPPORTED' });
        assert(f.target.blocks.getBlock('old'));
        assert.equal(f.counts.dirty, 0);
    }
});
test('stale guards before apply and after permission prevent block/storage mutation', async () => {
    const f = fixture(),
        token = await prepareProjectPatch(f);
    f.stale();
    assert.throws(() => applyProjectPatch(token), { code: 'PROJECT_CONFLICT' });
    assert(f.target.blocks.getBlock('old'));
    assert.equal(f.counts.dirty, 0);
    const g = fixture();
    g.candidate.targets[0].blocks.new.opcode = 'added_yamlMap';
    g.candidate.extensions = ['added'];
    g.candidate.extensionURLs = { added: 'https://example.invalid/extension.js' };
    g.vm.securityManager.canLoadExtensionFromProject = async () => {
        g.stale();
        return true;
    };
    await assert.rejects(prepareProjectPatch(g), { code: 'PROJECT_CONFLICT' });
    assert.equal(g.counts.extensionLoads, 0);
    assert(g.target.blocks.getBlock('old'));
});
test('new extensions use project security approval and expected definitions before a synchronous patch', async () => {
    const f = fixture();
    f.candidate.targets[0].blocks.new.opcode = 'added_yamlMap';
    f.candidate.extensions = ['added'];
    f.candidate.extensionURLs = { added: 'https://example.invalid/extension.js' };
    const token = await prepareProjectPatch(f);
    assert.equal(f.counts.extensionLoads, 1);
    assert(f.target.blocks.getBlock('old'));
    applyProjectPatch(token);
    assert.equal(f.target.blocks.getBlock('new').opcode, 'added_yamlMap');
    const denied = fixture();
    denied.candidate.targets[0].blocks.new.opcode = 'added_yamlMap';
    denied.candidate.extensions = ['added'];
    denied.candidate.extensionURLs = { added: 'https://example.invalid/extension.js' };
    denied.vm.securityManager.canLoadExtensionFromProject = async () => false;
    await assert.rejects(prepareProjectPatch(denied), { code: 'PROJECT_PATCH_EXTENSION' });
    assert.equal(denied.counts.extensionLoads, 0);
});
test('a native block creation failure restores original object identities and links synchronously', async () => {
    const f = fixture(),
        old = f.target.blocks.getBlock('old'),
        hat = f.target.blocks.getBlock('hat'),
        shadow = f.target.blocks.getBlock('old-shadow'),
        storage = f.vm.runtime.extensionStorage.owner.source;
    const create = f.target.blocks.createBlock;
    let thrown = false;
    f.target.blocks.createBlock = function (b) {
        if (b.id === 'new' && !thrown) {
            thrown = true;
            throw Error('create failed');
        }
        return create.call(this, b);
    };
    const scriptOrder = f.target.blocks.getScripts().slice();
    const token = await prepareProjectPatch(f);
    assert.throws(
        () => applyProjectPatch(token),
        (error) => error.code === 'REPRESENTATION_APPLY_FAILED' && error.rollbackSucceeded === true,
    );
    assert.equal(f.target.blocks.getBlock('hat'), hat);
    assert.equal(hat.next, 'old');
    assert.equal(f.target.blocks.getBlock('old'), old);
    assert.equal(f.target.blocks.getBlock('old-shadow'), shadow);
    assert.equal(f.vm.runtime.extensionStorage.owner.source, storage);
    assert.equal(storage.revision, 1);
    assert.equal(f.counts.dirty, 0);
    assert.equal(f.target.blocks.forceNoGlow, false);
    assert.deepEqual(f.target.blocks.getScripts(), scriptOrder);
});
test('workspace application failure rolls VM data back before the selective workspace rollback', async () => {
    const f = fixture(),
        source = f.vm.runtime.extensionStorage.owner.source,
        old = f.target.blocks.getBlock('old');
    let rollbacks = 0;
    installProjectPatchWorkspaceAdapter(f.vm, {
        prepare() {
            return {
                apply() {
                    assert.equal(source.revision, 2);
                    throw Error('workspace failed');
                },
                rollback() {
                    rollbacks++;
                    assert.equal(source.revision, 1);
                    assert.equal(f.target.blocks.getBlock('old'), old);
                },
            };
        },
    });
    const token = await prepareProjectPatch(f);
    assert.throws(
        () => applyProjectPatch(token),
        (error) => error.rollbackSucceeded === true,
    );
    assert.equal(rollbacks, 1);
    assert.equal(f.counts.dirty, 0);
    assert.deepEqual([f.counts.stop, f.counts.save, f.counts.load], [0, 0, 0]);
});

test('dangling/cyclic edges and inconsistent parents are rejected without touching an existing body', async () => {
    for (const mutate of [
        (p) => (p.targets[0].blocks.hat.next = 'absent'),
        (p) => (p.targets[0].blocks.new.parent = 'other'),
        (p) => {
            p.targets[0].blocks.new.next = 'hat';
            p.targets[0].blocks.hat.parent = 'new';
        },
    ]) {
        const f = fixture();
        mutate(f.candidate);
        await assert.rejects(prepareProjectPatch(f), { code: 'PROJECT_PATCH_UNSUPPORTED' });
        assert.equal(f.target.blocks.getBlock('hat').next, 'old');
        assert.equal(f.counts.dirty, 0);
    }
});
test('workspace ports must prepare synchronous apply and rollback operations', async () => {
    const f = fixture();
    installProjectPatchWorkspaceAdapter(f.vm, {
        prepare() {
            return { async apply() {}, rollback() {} };
        },
    });
    await assert.rejects(prepareProjectPatch(f), { code: 'PROJECT_PATCH_UNSUPPORTED' });
    assert.equal(f.target.blocks.getBlock('hat').next, 'old');
});

test('frozen source descriptors use a writable metadata ancestor without recreating assets or owner aliases', async () => {
    const f = fixture(),
        owner = f.vm.runtime.extensionStorage.owner,
        assets = owner.assets,
        alias = f.vm.runtime.extensionStorage.alias;
    Object.freeze(owner.source);
    const oldSource = owner.source;
    const token = await prepareProjectPatch(f);
    applyProjectPatch(token);
    assert.equal(f.vm.runtime.extensionStorage.owner, owner);
    assert.equal(f.vm.runtime.extensionStorage.owner.assets, assets);
    assert.equal(f.vm.runtime.extensionStorage.alias, alias);
    assert.notEqual(owner.source, oldSource);
    assert.equal(owner.source.revision, 2);
    assert.equal(oldSource.revision, 1);
    const rollback = fixture(),
        old = Object.freeze(rollback.vm.runtime.extensionStorage.owner.source);
    installProjectPatchWorkspaceAdapter(rollback.vm, {
        prepare() {
            return {
                apply() {
                    throw Error('UI failure');
                },
                rollback() {},
            };
        },
    });
    const failed = await prepareProjectPatch(rollback);
    assert.throws(
        () => applyProjectPatch(failed),
        (e) => e.rollbackSucceeded === true,
    );
    assert.equal(rollback.vm.runtime.extensionStorage.owner.source, old);
});

test('observer failure after a completed patch cannot turn a successful commit into a rollback', async () => {
    const f = fixture();
    let uiApplied = 0,
        uiRolledBack = 0;
    installProjectPatchWorkspaceAdapter(f.vm, {
        prepare() {
            return {
                apply() {
                    uiApplied++;
                },
                rollback() {
                    uiRolledBack++;
                },
            };
        },
    });
    f.vm.runtime.emitProjectChanged = () => {
        f.counts.dirty++;
        throw Error('unrelated observer failed');
    };
    const token = await prepareProjectPatch(f),
        result = applyProjectPatch(token);
    assert.equal(result.projectPatched, true);
    assert.equal(f.target.blocks.getBlock('hat').next, 'new');
    assert.equal(f.vm.runtime.extensionStorage.owner.source.revision, 2);
    assert.equal(uiApplied, 1);
    assert.equal(uiRolledBack, 0);
    assert.equal(f.counts.dirty, 1);
    assert.deepEqual([f.counts.stop, f.counts.save, f.counts.load], [0, 0, 0]);
});

test('unused extension metadata additions do not request permission or execute extension code', async () => {
    const f = fixture();
    let approvals = 0;
    f.candidate = {
        ...f.base,
        extensions: ['legacy-unused'],
        extensionURLs: { 'legacy-unused': 'https://example.invalid/legacy.js' },
    };
    f.vm.securityManager.canLoadExtensionFromProject = async () => {
        approvals++;
        throw Error('Unused extension must not be approved');
    };
    const token = await prepareProjectPatch(f);
    applyProjectPatch(token);
    assert.equal(approvals, 0);
    assert.equal(f.counts.extensionLoads, 0);
    assert.equal(f.counts.dirty, 0);
    assert.equal(f.target.blocks.getBlock('hat').next, 'old');
    const malformed = fixture();
    malformed.candidate = {
        ...malformed.base,
        extensions: ['unused'],
        extensionURLs: { unused: 'not an absolute URL' },
    };
    await assert.rejects(prepareProjectPatch(malformed), { code: 'PROJECT_PATCH_UNSUPPORTED' });
    assert.equal(malformed.counts.extensionLoads, 0);
    const removed = fixture();
    removed.base.extensions = ['existing'];
    removed.candidate = { ...removed.base, extensions: [] };
    await assert.rejects(prepareProjectPatch(removed), { code: 'PROJECT_PATCH_UNSUPPORTED' });
});
