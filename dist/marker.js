import { encodeReference, readReference, identifier, fail } from "./reference.js";
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value) => Number.isFinite(value);
const targetsOf = (project) => Array.isArray(project?.targets) ? project.targets : [];
export function createEmbeddedYamlMarker({ opcode, reference, x = 32, y = 32 }) {
    identifier(opcode, 'opcode');
    if (!Number.isFinite(x) || !Number.isFinite(y))
        fail('MARKER_INVALID', 'Marker coordinates must be finite.');
    return { opcode, next: null, parent: null, inputs: {}, fields: { DOCUMENT: [encodeReference(reference), null] }, shadow: false, topLevel: true, x, y };
}
/** Install a reference only; document eligibility and storage remain the owner's responsibility. */
export function installEmbeddedYamlMarker(project, options) {
    const encoded = encodeReference(options.reference);
    identifier(options.opcode, 'opcode');
    const stages = targetsOf(project).filter(target => target?.isStage === true);
    if (stages.length !== 1)
        fail('MARKER_INVALID', 'A project must have exactly one Stage.');
    const stage = stages[0];
    if (stage.blocks === undefined)
        stage.blocks = {};
    if (!record(stage.blocks))
        fail('MARKER_INVALID', 'Stage blocks must be an object.');
    const blocks = stage.blocks;
    for (const [id, block] of Object.entries(blocks)) {
        if (block?.opcode !== options.opcode)
            continue;
        try {
            if (encodeReference(readReference(block, stage)) === encoded)
                return id;
        }
        catch { /* A malformed or legacy marker does not claim another document. */ }
    }
    const base = 'embedded-yaml-document';
    let id = base;
    for (let suffix = 2; Object.hasOwn(blocks, id); suffix++)
        id = `${base}-${suffix}`;
    const positions = Object.values(blocks).filter(block => block?.topLevel === true);
    const y = options.y ?? (positions.length ? Math.min(...positions.map(block => finite(block.y) ? block.y : 0)) - 112 : 32);
    blocks[id] = createEmbeddedYamlMarker({ ...options, y });
    return id;
}
export function removeEmbeddedYamlMarkers(project, { opcodes }) {
    if (!Array.isArray(opcodes))
        fail('MARKER_INVALID', 'Known marker opcodes are required.');
    const known = new Set(opcodes.map(opcode => identifier(opcode, 'opcode')));
    let count = 0;
    for (const target of targetsOf(project)) {
        if (!record(target?.blocks))
            continue;
        const blocks = target.blocks;
        for (const [id, block] of Object.entries(blocks)) {
            if (!known.has(block?.opcode))
                continue;
            if (typeof block.next === 'string' && record(blocks[block.next])) {
                const next = blocks[block.next];
                next.parent = null;
                next.topLevel = true;
                next.x = finite(block.x) ? block.x : 32;
                next.y = finite(block.y) ? block.y : 32;
            }
            delete blocks[id];
            count++;
            for (const [commentId, comment] of Object.entries(target.comments || {}))
                if (comment?.blockId === id)
                    delete target.comments[commentId];
        }
    }
    return count;
}
/** Validate a root reference without repairing connected blocks or changing the project. */
export function validateEmbeddedYamlRootMarker(block, { opcode, target } = {}) {
    if (!record(block) || (opcode !== undefined && block.opcode !== opcode) || block.shadow !== false || block.topLevel !== true || block.parent != null || block.next != null || !record(block.inputs) || Object.keys(block.inputs).length)
        fail('ROOT_MARKER_INVALID', 'The embedded YAML root must be an independent, non-shadow reference with no connected blocks.');
    readEmbeddedYamlRootVersion(block);
    return readReference(block, target);
}
export function readEmbeddedYamlRootVersion(block) {
    const field = block?.fields?.VERSION;
    const value = Array.isArray(field) ? field[0] : field?.value;
    return identifier(value, 'VERSION');
}
export function createEmbeddedYamlRootMarker(options) {
    identifier(options.version, 'VERSION');
    const block = createEmbeddedYamlMarker(options);
    block.fields.VERSION = [options.version, null];
    validateEmbeddedYamlRootMarker(block, { opcode: options.opcode });
    return block;
}
/** Install one Stage entry reference; changing an existing entry requires explicit owner handling. */
export function installEmbeddedYamlRootMarker(project, options) {
    identifier(options.version, 'VERSION');
    identifier(options.opcode, 'opcode');
    const encoded = encodeReference(options.reference);
    const targets = targetsOf(project);
    const stages = targets.filter(target => target?.isStage === true);
    if (stages.length !== 1 || (stages[0].blocks !== undefined && !record(stages[0].blocks)))
        fail('ROOT_MARKER_INVALID', 'A root requires exactly one Stage with valid blocks.');
    const roots = targets.flatMap(target => Object.entries((target.blocks || {})).filter(([, block]) => block?.opcode === options.opcode).map(([id, block]) => ({ id, block, target })));
    if (roots.length > 1)
        fail('ROOT_MARKER_INVALID', 'A project cannot have multiple entry roots.');
    if (roots.length) {
        const root = roots[0];
        const actual = validateEmbeddedYamlRootMarker(root.block, { opcode: options.opcode, target: root.target });
        if (root.target !== stages[0] || encodeReference(actual) !== encoded || readEmbeddedYamlRootVersion(root.block) !== options.version)
            fail('ROOT_MARKER_INVALID', 'The existing entry root names another document or target.');
        return root.id;
    }
    const stage = stages[0];
    if (stage.blocks === undefined)
        stage.blocks = {};
    const blocks = stage.blocks;
    let id = 'embedded-yaml-root';
    for (let suffix = 2; Object.hasOwn(blocks, id); suffix++)
        id = `embedded-yaml-root-${suffix}`;
    blocks[id] = createEmbeddedYamlRootMarker(options);
    return id;
}
