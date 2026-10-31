import { encodeReference, identifier, fail } from "./reference.js";
import { embeddedYamlFileIconURI } from "./icon.js";
export function createEmbeddedYamlHatDefinition({ BlockType, operation = 'embeddedYaml', menuName = 'embeddedYamlDocuments', defaultReference }) {
    if (typeof BlockType?.HAT !== 'string')
        fail('HAT_INVALID', 'A hat block type is required.');
    identifier(operation, 'operation');
    identifier(menuName, 'menuName');
    return Object.freeze({ opcode: operation, blockType: BlockType.HAT, text: 'embedded YAML [DOCUMENT]', isEdgeActivated: false,
        blockIconURI: embeddedYamlFileIconURI, arguments: Object.freeze({ DOCUMENT: Object.freeze({ type: 'string', menu: menuName, defaultValue: encodeReference(defaultReference) }) }) });
}
export function createEmbeddedYamlDocumentMenu(documents) {
    if (!Array.isArray(documents))
        fail('DOCUMENT_METADATA_INVALID', 'A document metadata list is required.');
    const seen = new Set();
    const items = documents.map(document => {
        const value = encodeReference(document.reference);
        if (seen.has(value))
            fail('DOCUMENT_DUPLICATE', 'Document references must be unique.');
        seen.add(value);
        if (typeof document.filename !== 'string' || !document.filename.length || document.filename.length > 4096)
            fail('DOCUMENT_METADATA_INVALID', 'A bounded filename is required.');
        return Object.freeze({ text: document.filename, value });
    });
    // Scratch dropdowns require one item even when no document is currently available.
    if (!items.length)
        items.push(Object.freeze({ text: '—', value: '' }));
    return Object.freeze({ acceptReporters: false, items: Object.freeze(items) });
}
export const embeddedYamlRootShapeExtension = 'tw_embedded_yaml_root_shape_v1';
export const embeddedYamlRootHatShapeExtension = embeddedYamlRootShapeExtension;
const rootShapeRegistration = Symbol.for('@kubohiroya/turbowarp-embedded-yaml/root-shape/v1');
/** Register through the supported ScratchBlocks extension API before root block initialization. */
export function registerEmbeddedYamlRootHatShape(Blockly) {
    if (typeof Blockly?.Extensions?.register !== 'function')
        fail('HAT_INVALID', 'ScratchBlocks extensions are required.');
    const host = Blockly;
    if (host[rootShapeRegistration])
        return;
    Blockly.Extensions.register(embeddedYamlRootShapeExtension, function () {
        this.setPreviousStatement(false);
        this.setNextStatement(false);
    });
    Object.defineProperty(Blockly, rootShapeRegistration, { value: true });
}
/** An inert, independently placed entry reference; its content lives in ordinary document hats. */
export function createEmbeddedYamlRootHatDefinition(options) {
    identifier(options.defaultVersion, 'defaultVersion');
    const versionMenuName = identifier(options.versionMenuName ?? 'embeddedYamlVersions', 'versionMenuName');
    const definition = createEmbeddedYamlHatDefinition({ ...options, operation: options.operation ?? 'embeddedYamlRoot' });
    return Object.freeze({ ...definition, text: 'embedded YAML root [VERSION] [DOCUMENT]', isTerminal: true,
        arguments: Object.freeze({ ...definition.arguments, VERSION: Object.freeze({ type: 'string', menu: versionMenuName, defaultValue: options.defaultVersion }) }),
        extensions: Object.freeze([embeddedYamlRootShapeExtension]) });
}
/** Versions are owner-defined literal choices; the generic library does not interpret them. */
export function createEmbeddedYamlRootVersionMenu(versions) {
    if (!Array.isArray(versions) || !versions.length || versions.length > 64)
        fail('HAT_INVALID', 'A bounded nonempty version list is required.');
    const seen = new Set();
    const items = versions.map(version => {
        identifier(version, 'VERSION');
        if (seen.has(version))
            fail('HAT_INVALID', 'Version choices must be unique.');
        seen.add(version);
        return Object.freeze({ text: version, value: version });
    });
    return Object.freeze({ acceptReporters: false, items: Object.freeze(items) });
}
