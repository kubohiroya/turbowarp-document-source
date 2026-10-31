/** Minimal synchronous VM transactions. This module never saves or loads an SB3 archive. */
export const projectPatchWorkspaceAdapterSymbol = Symbol.for('@kubohiroya/turbowarp-embedded-yaml/project-patch-workspace/v1');
const patches = new WeakMap();
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const plain = (value) => object(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const fail = (code, message, extra) => Object.assign(new Error(message), { code, ...extra });
function invalid(message) {
    throw fail('PROJECT_PATCH_UNSUPPORTED', message);
}
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const core = new Set([
    'argument',
    'colour',
    'control',
    'data',
    'event',
    'looks',
    'math',
    'motion',
    'operator',
    'procedures',
    'sensing',
    'sound',
    'text',
]);
const protectedStorageKeys = new Set(['assets', 'assetDistribution', 'costumes', 'sounds']);
const equal = (a, b) => a === b ||
    (Array.isArray(a) && Array.isArray(b)
        ? a.length === b.length && a.every((v, i) => equal(v, b[i]))
        : plain(a) && plain(b)
            ? Object.keys(a).length === Object.keys(b).length &&
                Object.keys(a).every((k) => own(b, k) && equal(a[k], b[k]))
            : false);
const clone = (value) => {
    if (value === null ||
        ['string', 'boolean'].includes(typeof value) ||
        (typeof value === 'number' && Number.isFinite(value)))
        return value;
    if (Array.isArray(value))
        return value.map(clone);
    if (!plain(value))
        invalid('Changed values must contain finite JSON data.');
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
};
export function installProjectPatchWorkspaceAdapter(vm, adapter) {
    if (!vm ||
        typeof adapter?.prepare !== 'function' ||
        (adapter.hasBlockDefinition !== undefined &&
            typeof adapter.hasBlockDefinition !== 'function'))
        throw new TypeError('A VM and synchronous workspace adapter are required.');
    const host = vm;
    if (host[projectPatchWorkspaceAdapterSymbol] &&
        host[projectPatchWorkspaceAdapterSymbol] !== adapter)
        throw fail('PROJECT_PATCH_WORKSPACE', 'A workspace adapter is already installed.');
    Object.defineProperty(vm, projectPatchWorkspaceAdapterSymbol, {
        value: adapter,
        configurable: true,
    });
    return () => {
        if (host[projectPatchWorkspaceAdapterSymbol] === adapter)
            delete host[projectPatchWorkspaceAdapterSymbol];
    };
}
export function canPatchProject(vm) {
    return patchable(vm);
}
function patchable(vm) {
    const targets = vm?.runtime?.targets?.filter((target) => target?.isOriginal !== false);
    return (Array.isArray(targets) &&
        targets.length > 0 &&
        plain(vm.runtime.extensionStorage) &&
        targets.every((target) => typeof target.id === 'string' &&
            typeof target.blocks?.getBlock === 'function' &&
            typeof target.blocks?.createBlock === 'function' &&
            typeof target.blocks?.deleteBlock === 'function' &&
            typeof target.blocks?.resetCache === 'function' &&
            object(target.comments)));
}
function rootFor(blocks, id) {
    const seen = new Set();
    while (typeof id === 'string') {
        if (seen.has(id))
            invalid('A block parent chain is cyclic.');
        seen.add(id);
        const block = blocks(id);
        if (!block)
            return null;
        if (block.parent === null || block.parent === undefined)
            return id;
        id = block.parent;
    }
    return null;
}
function storageChanges(base, candidate, path = [], result = []) {
    if (equal(base, candidate))
        return result;
    if (path.some((key) => protectedStorageKeys.has(key)))
        invalid('Asset bundles and distribution metadata cannot be changed by a block patch.');
    if (plain(base) && plain(candidate)) {
        for (const key of new Set([...Object.keys(base), ...Object.keys(candidate)]))
            storageChanges(base[key], candidate[key], [...path, key], result);
    }
    else {
        // An inserted/deleted subtree cannot conceal an asset replacement.
        const inspect = (value, trail) => {
            if (!plain(value))
                return;
            for (const [key, item] of Object.entries(value)) {
                if (protectedStorageKeys.has(key))
                    invalid('Asset-bearing storage subtrees cannot be inserted or removed.');
                inspect(item, [...trail, key]);
            }
        };
        inspect(base, path);
        inspect(candidate, path);
        result.push({ path, value: candidate, present: candidate !== undefined });
    }
    return result;
}
function storageParent(root, path) {
    let parent = root;
    for (const key of path.slice(0, -1)) {
        const descriptor = Object.getOwnPropertyDescriptor(parent, key);
        if (!descriptor || !own(descriptor, 'value') || !plain(descriptor.value))
            invalid('Changed storage paths must resolve through existing data records.');
        parent = descriptor.value;
    }
    return { parent, key: path.at(-1) };
}
const pathPrefix = (prefix, path) => prefix.length <= path.length && prefix.every((key, i) => key === path[i]);
function writableLocation(root, path) {
    const { parent, key } = storageParent(root, path), descriptor = Object.getOwnPropertyDescriptor(parent, key);
    if (descriptor
        ? own(descriptor, 'value') && descriptor.writable && descriptor.configurable
        : Object.isExtensible(parent))
        return { parent, key, descriptor };
    return null;
}
// Copy only a frozen metadata branch, retaining untouched asset and alias property descriptors.
function copyChangedBranch(value, changes) {
    if (!plain(value))
        invalid('Only source metadata records can be promoted for a frozen leaf.');
    const descriptors = Object.getOwnPropertyDescriptors(value), groups = new Map();
    for (const change of changes) {
        const [key, ...rest] = change.path;
        if (!groups.has(key))
            groups.set(key, []);
        groups.get(key).push({ ...change, path: rest });
    }
    for (const [key, group] of groups) {
        const direct = group.find((change) => !change.path.length);
        if (direct) {
            if (direct.present)
                descriptors[key] = {
                    value: clone(direct.value),
                    writable: true,
                    enumerable: descriptors[key]?.enumerable ?? true,
                    configurable: true,
                };
            else
                delete descriptors[key];
        }
        else {
            const previous = descriptors[key];
            if (!previous || !own(previous, 'value'))
                invalid('Frozen metadata paths must resolve through data properties.');
            descriptors[key] = {
                value: copyChangedBranch(previous.value, group),
                writable: true,
                enumerable: previous.enumerable,
                configurable: true,
            };
        }
    }
    return Object.create(Object.getPrototypeOf(value), descriptors);
}
function planStorageChanges(root, changes) {
    const proposed = [];
    for (const change of changes) {
        if (!change.path.length)
            invalid('The root storage object cannot be replaced.');
        let path = change.path.slice(), location;
        while (path.length) {
            location = writableLocation(root, path);
            if (location)
                break;
            path = path.slice(0, -1);
        }
        if (!location)
            invalid('Storage has no writable source metadata ancestor.');
        proposed.push({ path, ...location });
    }
    proposed.sort((a, b) => a.path.length - b.path.length);
    const anchors = [];
    for (const anchor of proposed)
        if (!anchors.some((other) => pathPrefix(other.path, anchor.path)))
            anchors.push(anchor);
    return anchors.map((anchor) => {
        const selected = changes.filter((change) => pathPrefix(anchor.path, change.path));
        const direct = selected.find((change) => change.path.length === anchor.path.length);
        return {
            ...anchor,
            present: direct ? direct.present : true,
            next: direct
                ? direct.present
                    ? clone(direct.value)
                    : undefined
                : copyChangedBranch(anchor.descriptor.value, selected.map((change) => ({
                    ...change,
                    path: change.path.slice(anchor.path.length),
                }))),
        };
    });
}
function extensionId(opcode) {
    const split = opcode.indexOf('_');
    const prefix = split < 0 ? opcode : opcode.slice(0, split);
    return core.has(prefix) ? null : split < 0 ? null : prefix;
}
async function ensureExtensions(vm, base, candidate, blocks, assertCurrent) {
    const before = base.extensions ?? [], after = candidate.extensions ?? [];
    if (!Array.isArray(before) ||
        !Array.isArray(after) ||
        before.some((id) => !after.includes(id)) ||
        after.some((id) => typeof id !== 'string'))
        invalid('Only extension additions are permitted.');
    const oldURLs = base.extensionURLs ?? {}, urls = candidate.extensionURLs ?? {};
    if (!plain(oldURLs) ||
        !plain(urls) ||
        Object.keys(oldURLs).some((id) => urls[id] !== oldURLs[id]))
        invalid('Existing extension URLs cannot be removed or replaced.');
    for (const [id, url] of Object.entries(urls)) {
        if (own(oldURLs, id))
            continue;
        let parsed;
        try {
            if (typeof url !== 'string' || !url)
                throw new Error('Missing URL');
            parsed = new URL(url);
        }
        catch {
            invalid('Added extension URLs must be valid absolute URLs.');
        }
        if (!['https:', 'http:', 'data:'].includes(parsed.protocol) ||
            (parsed.protocol === 'data:' &&
                !/^data:(?:application|text)\/javascript[;,]/u.test(url)))
            invalid('Added extension URLs must use an extension script URL.');
    }
    // Metadata may mention compatibility runtimes: load only extensions used by actual block changes.
    const ids = new Set(blocks.map((block) => extensionId(block.opcode)).filter(Boolean));
    const manager = vm.extensionManager;
    for (const id of ids) {
        if (manager?.isExtensionLoaded?.(id))
            continue;
        if (manager?.isBuiltinExtension?.(id)) {
            if (typeof manager.loadExtensionIdSync !== 'function')
                invalid('The VM cannot load the required built-in extension.');
            manager.loadExtensionIdSync(id);
            assertCurrent();
            continue;
        }
        const url = urls[id];
        if (typeof url !== 'string' ||
            !url ||
            typeof manager?.loadExtensionURL !== 'function' ||
            typeof vm.securityManager?.canLoadExtensionFromProject !== 'function')
            throw fail('PROJECT_PATCH_EXTENSION', `The required extension is not available: ${id}`);
        if (!(await vm.securityManager.canLoadExtensionFromProject(url)))
            throw fail('PROJECT_PATCH_EXTENSION', `Permission to load the required extension was denied: ${id}`);
        assertCurrent();
        await manager.loadExtensionURL(url);
        assertCurrent();
        if (!manager.isExtensionLoaded(id))
            throw fail('PROJECT_PATCH_EXTENSION', `The extension did not register its expected ID: ${id}`);
    }
    assertBlockDefinitions(vm, blocks);
}
function assertBlockDefinitions(vm, blocks) {
    const definitions = typeof vm.runtime.getBlocksJSON === 'function'
        ? new Set(vm.runtime
            .getBlocksJSON()
            .filter(Boolean)
            .map((info) => info.type))
        : null;
    for (const block of blocks) {
        const opcode = block.opcode;
        let registeredShadow = false;
        // VM block JSON omits menu shadows; only the host can attest its registered GUI definitions.
        if (block.shadow === true &&
            extensionId(opcode) &&
            !definitions?.has(opcode) &&
            typeof vm.runtime.getOpcodeFunction?.(opcode) !== 'function') {
            const workspace = vm[projectPatchWorkspaceAdapterSymbol];
            try {
                const proof = workspace?.hasBlockDefinition?.(opcode);
                // Never accept asynchronous proof; consume a rejection without letting it escape.
                if (proof !== null && ['object', 'function'].includes(typeof proof))
                    Promise.resolve(proof).catch(() => { });
                registeredShadow = proof === true;
            }
            catch {
                // A failed or asynchronous capability is not proof that the definition exists.
            }
        }
        if (extensionId(opcode) &&
            !(definitions?.has(opcode) ||
                typeof vm.runtime.getOpcodeFunction?.(opcode) === 'function' ||
                registeredShadow))
            throw fail('PROJECT_PATCH_EXTENSION', `The required block definition is not available: ${opcode}`);
    }
}
const safeKey = (key) => typeof key === 'string' &&
    !!key &&
    key.length <= 4096 &&
    !['__proto__', 'constructor', 'prototype'].includes(key);
function validateGraph(blocks) {
    const edges = new Map();
    for (const [id, block] of Object.entries(blocks)) {
        if (!safeKey(id))
            invalid('Unsafe block ID.');
        if (Array.isArray(block))
            continue; // Unchanged top-level variable/list primitives stay native.
        if (!plain(block) ||
            typeof block.opcode !== 'string' ||
            !plain(block.inputs) ||
            !plain(block.fields))
            invalid('Malformed serialized block.');
        const children = new Set();
        if (block.next !== null && block.next !== undefined) {
            if (typeof block.next !== 'string')
                invalid('Invalid next block reference.');
            children.add(block.next);
        }
        for (const [name, input] of Object.entries(block.inputs)) {
            if (!safeKey(name) || !Array.isArray(input) || ![1, 2, 3].includes(input[0]))
                invalid('Invalid input tuple.');
            for (const value of input.slice(1))
                if (typeof value === 'string')
                    children.add(value);
                else if (value !== null && !Array.isArray(value))
                    invalid('Invalid input reference.');
        }
        for (const name of Object.keys(block.fields))
            if (!safeKey(name))
                invalid('Unsafe field name.');
        for (const child of children)
            if (!own(blocks, child) || !plain(blocks[child]) || blocks[child].parent !== id)
                invalid('A block edge is dangling or has an inconsistent parent.');
        if (block.parent !== null &&
            block.parent !== undefined &&
            (!own(blocks, block.parent) || !plain(blocks[block.parent])))
            invalid('A block parent is missing.');
        edges.set(id, [...children]);
    }
    const complete = new Set(), visiting = new Set();
    for (const start of edges.keys()) {
        if (complete.has(start))
            continue;
        const stack = [[start, false]];
        while (stack.length) {
            const [id, exit] = stack.pop();
            if (exit) {
                visiting.delete(id);
                complete.add(id);
                continue;
            }
            if (complete.has(id))
                continue;
            if (visiting.has(id))
                invalid('The block graph is cyclic.');
            visiting.add(id);
            stack.push([id, true]);
            for (const child of edges.get(id) ?? [])
                stack.push([child, false]);
        }
    }
}
function blockConverter(vm, target, before, after, changed) {
    const additions = new Map(), keepShadows = new Set();
    let serial = 0;
    const fresh = () => {
        let id;
        do {
            id = `document-patch-shadow-${++serial}`;
        } while (own(after, id) ||
            additions.has(id) ||
            vm.runtime.targets.some((t) => t.blocks?.getBlock(id)));
        return id;
    };
    const primitive = (value, parent, shadow) => {
        if (value === null || typeof value === 'string')
            return value;
        if (!Array.isArray(value) || !Number.isInteger(value[0]))
            invalid('Only serialized literal inputs are supported.');
        const types = {
            4: ['math_number', 'NUM'],
            5: ['math_positive_number', 'NUM'],
            6: ['math_whole_number', 'NUM'],
            7: ['math_integer', 'NUM'],
            8: ['math_angle', 'NUM'],
            9: ['colour_picker', 'COLOUR'],
            10: ['text', 'TEXT'],
            11: ['event_broadcast_menu', 'BROADCAST_OPTION'],
            12: ['data_variable', 'VARIABLE'],
            13: ['data_listcontents', 'LIST'],
        };
        const type = types[value[0]];
        if (!type)
            invalid('Unknown serialized primitive input.');
        const id = fresh(), field = { name: type[1], value: clone(value[1]) };
        if (value[0] >= 11) {
            field.id = value[2];
            field.variableType = value[0] === 11 ? 'broadcast_msg' : value[0] === 13 ? 'list' : '';
        }
        additions.set(id, {
            id,
            opcode: type[0],
            next: null,
            parent,
            shadow,
            inputs: {},
            fields: { [type[1]]: field },
            topLevel: false,
        });
        return id;
    };
    for (const id of changed) {
        if (!own(after, id))
            continue;
        const source = after[id];
        if (!plain(source) ||
            typeof source.opcode !== 'string' ||
            !plain(source.inputs) ||
            !plain(source.fields))
            invalid('Changed blocks must use the serialized SB3 record format.');
        if (!own(before, id) && target.blocks.getBlock(id))
            invalid('A new block ID collides with an existing literal block.');
        const block = { ...clone(source), id, inputs: {}, fields: {} };
        for (const [name, value] of Object.entries(source.fields)) {
            if (!Array.isArray(value) || !value.length || value.length > 2)
                invalid('Changed fields require static SB3 field tuples.');
            const f = { name, value: clone(value[0]) };
            if (value.length > 1)
                f.id = value[1];
            if (['VARIABLE', 'LIST', 'BROADCAST_OPTION'].includes(name))
                f.variableType =
                    name === 'LIST' ? 'list' : name === 'BROADCAST_OPTION' ? 'broadcast_msg' : '';
            block.fields[name] = f;
        }
        const live = target.blocks.getBlock(id);
        for (const [name, value] of Object.entries(source.inputs)) {
            if (live &&
                equal(before[id]?.inputs?.[name], value) &&
                live.inputs?.[name]) {
                block.inputs[name] = live.inputs[name];
                const shadow = live.inputs[name].shadow;
                if (typeof shadow === 'string')
                    keepShadows.add(shadow);
                continue;
            }
            if (!Array.isArray(value) || ![1, 2, 3].includes(value[0]))
                invalid('Changed inputs require serialized SB3 tuples.');
            const first = primitive(value[1], id, value[0] === 1);
            const shadow = value[0] === 1 ? first : value[0] === 3 ? primitive(value[2], id, true) : null;
            block.inputs[name] = { name, block: first, shadow };
        }
        additions.set(id, block);
    }
    return { additions, keepShadows };
}
function captureBlocks(target, before, after, changed, converted) {
    const old = new Map(), links = new Map();
    const remember = (id) => {
        if (old.has(id))
            return;
        const block = target.blocks.getBlock(id);
        if (!block)
            return;
        old.set(id, block);
        links.set(id, {
            next: block.next,
            inputs: block.inputs,
            descriptors: Object.getOwnPropertyDescriptors(block),
        });
    };
    for (const id of changed) {
        remember(id);
        const live = target.blocks.getBlock(id);
        for (const input of Object.values(live?.inputs ?? {}))
            for (const child of new Set([input.block, input.shadow])) {
                const block = typeof child === 'string' ? target.blocks.getBlock(child) : null;
                if (block?.shadow && !own(after, child) && !converted.keepShadows.has(child))
                    remember(child);
            }
    }
    return { old, links };
}
function restoreBlock(block, descriptors) {
    for (const key of Reflect.ownKeys(block))
        if (!own(descriptors, key))
            delete block[key];
    Object.defineProperties(block, descriptors);
}
function restoreScripts(plan, rollback = false) {
    const scripts = plan.target.blocks.getScripts?.();
    if (!Array.isArray(scripts))
        return;
    const desired = rollback
        ? plan.scripts
        : [
            ...plan.scripts.filter((id) => plan.target.blocks.getBlock(id)?.topLevel),
            ...scripts.filter((id) => !plan.scripts.includes(id)),
        ];
    scripts.splice(0, scripts.length, ...desired);
}
function disconnect(block) {
    block.next = null;
    block.inputs = {};
}
function deleteIds(target, ids) {
    ids = [...ids];
    for (const id of ids) {
        const b = target.blocks.getBlock(id);
        if (b)
            disconnect(b);
    }
    for (const id of ids)
        target.blocks.deleteBlock(id);
}
function targetPlan(vm, target, before, after) {
    if (!plain(before.blocks ?? {}) ||
        !plain(after.blocks ?? {}) ||
        !plain(before.comments ?? {}) ||
        !plain(after.comments ?? {}))
        invalid('Block and comment dictionaries are required.');
    const b = (before.blocks ?? {}), a = (after.blocks ?? {});
    const beforeComments = before.comments, afterComments = after.comments;
    validateGraph(a);
    const changed = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((id) => !equal(b[id], a[id]));
    const comments = [
        ...new Set([...Object.keys(beforeComments ?? {}), ...Object.keys(afterComments ?? {})]),
    ].filter((id) => !equal(beforeComments?.[id], afterComments?.[id]));
    if (changed.length > 100000 || comments.length > 50000)
        invalid('The patch exceeds its block or comment limit.');
    if (comments.some((id) => !safeKey(id)))
        invalid('Unsafe comment ID.');
    const converted = blockConverter(vm, target, b, a, changed), saved = captureBlocks(target, b, a, changed, converted);
    const beforeRoots = new Set(), afterRoots = new Set();
    const serialized = (key) => a[key];
    for (const id of changed) {
        const oldRoot = rootFor((key) => target.blocks.getBlock(key), id), newRoot = rootFor(serialized, id);
        if (oldRoot)
            beforeRoots.add(oldRoot);
        if (newRoot)
            afterRoots.add(newRoot);
    }
    for (const id of comments) {
        const oldBlock = beforeComments?.[id]?.blockId, newBlock = afterComments?.[id]?.blockId;
        if (oldBlock) {
            const root = rootFor((key) => target.blocks.getBlock(key), oldBlock);
            if (root)
                beforeRoots.add(root);
        }
        if (newBlock) {
            const root = rootFor(serialized, newBlock);
            if (root)
                afterRoots.add(root);
        }
    }
    const oldComments = new Map(comments.map((id) => [id, Object.getOwnPropertyDescriptor(target.comments, id)]));
    if (comments.length && typeof target.createComment !== 'function')
        invalid('The VM must support native comment creation.');
    for (const id of comments)
        if (own(afterComments ?? {}, id)) {
            const c = afterComments[id];
            if (!plain(c) ||
                typeof c.text !== 'string' ||
                !['x', 'y', 'width', 'height'].every((k) => Number.isFinite(c[k])) ||
                typeof c.minimized !== 'boolean')
                invalid('Changed comments must contain native finite geometry and text.');
        }
    return {
        target,
        changed,
        comments,
        converted,
        saved,
        oldComments,
        after: after,
        scripts: target.blocks.getScripts?.().slice() ?? [],
        info: Object.freeze({
            targetId: target.id,
            beforeRootIds: Object.freeze([...beforeRoots]),
            afterRootIds: Object.freeze([...afterRoots]),
            changedBlockIds: Object.freeze(changed),
            changedCommentIds: Object.freeze(comments),
        }),
    };
}
/** Validate and approve prerequisites only; no blocks, storage or archive are changed. */
export async function prepareProjectPatch({ vm, baseProject, candidateProject, assertCurrent, }) {
    if (!patchable(vm) || typeof assertCurrent !== 'function')
        throw new TypeError('A compatible VM and current-snapshot guard are required.');
    if (!plain(baseProject) || !plain(candidateProject))
        invalid('Two serialized projects are required.');
    assertCurrent();
    for (const key of new Set([...Object.keys(baseProject), ...Object.keys(candidateProject)]))
        if (!['targets', 'extensionStorage', 'extensions', 'extensionURLs'].includes(key) &&
            !equal(baseProject[key], candidateProject[key]))
            invalid(`Project ${key} cannot be changed by a block patch.`);
    const originals = vm.runtime.targets.filter((target) => target.isOriginal !== false), base = baseProject.targets, after = candidateProject.targets;
    if (!Array.isArray(base) ||
        !Array.isArray(after) ||
        base.length !== after.length ||
        base.length !== originals.length)
        invalid('Targets cannot be added, removed or reordered.');
    const plans = [];
    for (let i = 0; i < base.length; i++) {
        const old = base[i], next = after[i], target = originals[i];
        if (!plain(old) ||
            !plain(next) ||
            old.isStage !== target.isStage ||
            (old.name !== undefined && old.name !== (target.getName?.() ?? target.name)))
            invalid('Target identity changed.');
        for (const key of new Set([...Object.keys(old), ...Object.keys(next)]))
            if (!['blocks', 'comments'].includes(key) && !equal(old[key], next[key]))
                invalid(`Target ${key} cannot be changed by a block patch.`);
        const plan = targetPlan(vm, target, old, next);
        if (plan.changed.length || plan.comments.length)
            plans.push(plan);
    }
    const storage = storageChanges(baseProject.extensionStorage ?? {}, candidateProject.extensionStorage ?? {});
    const changedBlocks = plans.flatMap((p) => [...p.converted.additions.values()]);
    await ensureExtensions(vm, baseProject, candidateProject, changedBlocks, assertCurrent);
    assertCurrent();
    const storagePlan = planStorageChanges(vm.runtime.extensionStorage, storage);
    const workspace = vm[projectPatchWorkspaceAdapterSymbol];
    const targetChanges = Object.freeze(plans.map((plan) => plan.info));
    const ui = workspace?.prepare({ targetChanges });
    if (ui &&
        (typeof ui.apply !== 'function' ||
            typeof ui.rollback !== 'function' ||
            typeof ui.then === 'function' ||
            ui.apply.constructor.name === 'AsyncFunction' ||
            ui.rollback.constructor.name === 'AsyncFunction'))
        invalid('Workspace preparation must return a synchronous apply/rollback pair.');
    assertCurrent();
    const token = Object.freeze({ projectPatch: true });
    patches.set(token, {
        vm,
        assertCurrent,
        plans,
        storagePlan,
        ui: ui,
        targetChanges,
        changedBlocks,
        runtime: vm.runtime,
        originals,
        used: false,
    });
    return token;
}
/** Apply one prepared patch synchronously; restore original objects on any failure. */
export function applyProjectPatch(token) {
    const plan = patches.get(token);
    if (!plan || plan.used)
        throw fail('PROJECT_PATCH_INVALID', 'Prepare a fresh project patch.');
    const { vm, assertCurrent, plans, storagePlan, ui } = plan;
    assertCurrent();
    if (vm.runtime !== plan.runtime || plan.originals.some((t) => !vm.runtime.targets.includes(t)))
        throw fail('PROJECT_CONFLICT', 'The VM targets changed.');
    assertBlockDefinitions(vm, plan.changedBlocks);
    assertCurrent();
    plan.used = true;
    patches.delete(token);
    const forces = plans.map((p) => p.target.blocks.forceNoGlow);
    for (const p of plans)
        p.target.blocks.forceNoGlow = true;
    try {
        for (const p of plans) {
            deleteIds(p.target, [...p.saved.old.keys()].filter((id) => !p.converted.additions.has(id)));
            for (const block of p.converted.additions.values()) {
                const current = p.target.blocks.getBlock(block.id);
                if (current) {
                    for (const key of Object.keys(current))
                        if (!own(block, key))
                            delete current[key];
                    Object.assign(current, block);
                }
                else
                    p.target.blocks.createBlock(block);
            }
            restoreScripts(p);
            p.target.blocks.resetCache();
            for (const id of p.comments) {
                delete p.target.comments[id];
                const c = p.after.comments?.[id];
                if (c)
                    p.target.createComment(id, c.blockId, (c.text ?? '') + (c.extraText ?? ''), c.x, c.y, c.width, c.height, c.minimized);
            }
        }
        for (const change of storagePlan) {
            if (change.present)
                Object.defineProperty(change.parent, change.key, {
                    value: change.next,
                    writable: true,
                    enumerable: true,
                    configurable: true,
                });
            else
                delete change.parent[change.key];
        }
        ui?.apply();
        try {
            if (plans.length || storagePlan.length)
                vm.runtime.emitProjectChanged?.();
        }
        catch {
            /* Observers cannot reject an already committed patch. */
        }
    }
    catch (cause) {
        let rollbackError;
        try {
            for (const change of [...storagePlan].reverse()) {
                if (change.descriptor)
                    Object.defineProperty(change.parent, change.key, change.descriptor);
                else
                    delete change.parent[change.key];
            }
            for (const p of [...plans].reverse()) {
                deleteIds(p.target, [...p.converted.additions.keys()].filter((id) => !p.saved.old.has(id)));
                for (const [id, block] of p.saved.old) {
                    const links = p.saved.links.get(id);
                    restoreBlock(block, links.descriptors);
                    if (!p.target.blocks.getBlock(id))
                        p.target.blocks.createBlock(block);
                }
                restoreScripts(p, true);
                for (const [id, descriptor] of p.oldComments) {
                    if (descriptor)
                        Object.defineProperty(p.target.comments, id, descriptor);
                    else
                        delete p.target.comments[id];
                }
                p.target.blocks.resetCache();
            }
            ui?.rollback();
        }
        catch (error) {
            rollbackError = error;
        }
        throw fail('REPRESENTATION_APPLY_FAILED', rollbackError
            ? 'The block patch failed and automatic restoration could not complete.'
            : 'The block patch failed. Original blocks and document data were restored.', {
            cause,
            rollbackSucceeded: !rollbackError,
            ...(rollbackError ? { rollbackError } : {}),
        });
    }
    finally {
        plans.forEach((p, i) => {
            p.target.blocks.forceNoGlow = forces[i];
        });
    }
    return {
        projectPatched: true,
        changedTargets: plan.targetChanges,
        changedStoragePaths: storagePlan.map((change) => change.path.slice()),
    };
}
