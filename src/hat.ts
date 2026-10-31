import type {SourceDocumentReference, RegisteredSourceDocumentMetadata} from '@kubohiroya/turbowarp-document-data/composition';
import {encodeReference, identifier, fail} from './reference.ts';
import {embeddedYamlFileIconURI} from './icon.ts';
export interface EmbeddedYamlHatOptions {
    readonly BlockType: Readonly<Record<string, string>>;
    readonly operation?: string;
    readonly menuName?: string;
    readonly defaultReference: SourceDocumentReference;
}
export interface EmbeddedYamlRootHatOptions extends EmbeddedYamlHatOptions {
    readonly defaultVersion: string;
    readonly versionMenuName?: string;
}
export type EmbeddedYamlMenuArgument = Readonly<{type: 'string'; menu: string; defaultValue: string}>;
export type EmbeddedYamlHatDefinition = Readonly<{
    opcode: string; blockType: string; text: string; isEdgeActivated: false; blockIconURI: string;
    arguments: Readonly<{DOCUMENT: EmbeddedYamlMenuArgument}>;
}>;
export type EmbeddedYamlRootHatDefinition = EmbeddedYamlHatDefinition & Readonly<{
    isTerminal: true; extensions: readonly string[];
    arguments: EmbeddedYamlHatDefinition['arguments'] & Readonly<{VERSION: EmbeddedYamlMenuArgument}>;
}>;
export type EmbeddedYamlMenu = Readonly<{acceptReporters: false; items: readonly Readonly<{text: string; value: string}>[]}>;
/** The part of ScratchBlocks used to register the disconnected root shape. */
export interface EmbeddedYamlRootShapeHost {
    Extensions: {register(name: string, initializer: (this: {setPreviousStatement(value: boolean): void; setNextStatement(value: boolean): void}) => void): void};
}
export function createEmbeddedYamlHatDefinition({BlockType, operation = 'embeddedYaml', menuName = 'embeddedYamlDocuments', defaultReference}: EmbeddedYamlHatOptions): EmbeddedYamlHatDefinition {
    if (typeof BlockType?.HAT !== 'string') fail('HAT_INVALID', 'A hat block type is required.');
    identifier(operation, 'operation'); identifier(menuName, 'menuName');
    return Object.freeze({opcode: operation, blockType: BlockType.HAT, text: 'embedded YAML [DOCUMENT]', isEdgeActivated: false,
        blockIconURI: embeddedYamlFileIconURI, arguments: Object.freeze({DOCUMENT: Object.freeze({type: 'string', menu: menuName, defaultValue: encodeReference(defaultReference)})})});
}
export function createEmbeddedYamlDocumentMenu(documents: readonly RegisteredSourceDocumentMetadata[]): EmbeddedYamlMenu {
    if (!Array.isArray(documents)) fail('DOCUMENT_METADATA_INVALID', 'A document metadata list is required.');
    const seen = new Set<string>();
    const items = documents.map(document => {
        const value = encodeReference(document.reference);
        if (seen.has(value)) fail('DOCUMENT_DUPLICATE', 'Document references must be unique.');
        seen.add(value);
        if (typeof document.filename !== 'string' || !document.filename.length || document.filename.length > 4096) fail('DOCUMENT_METADATA_INVALID', 'A bounded filename is required.');
        return Object.freeze({text: document.filename, value});
    });
    // Scratch dropdowns require one item even when no document is currently available.
    if (!items.length) items.push(Object.freeze({text: '—', value: ''}));
    return Object.freeze({acceptReporters: false, items: Object.freeze(items)});
}

export const embeddedYamlRootShapeExtension = 'tw_embedded_yaml_root_shape_v1';
export const embeddedYamlRootHatShapeExtension = embeddedYamlRootShapeExtension;
const rootShapeRegistration = Symbol.for('@kubohiroya/turbowarp-embedded-yaml/root-shape/v1');
/** Register through the supported ScratchBlocks extension API before root block initialization. */
export function registerEmbeddedYamlRootHatShape(Blockly: EmbeddedYamlRootShapeHost): void {
    if (typeof Blockly?.Extensions?.register !== 'function') fail('HAT_INVALID', 'ScratchBlocks extensions are required.');
    const host = Blockly as EmbeddedYamlRootShapeHost & {[rootShapeRegistration]?: true};
    if (host[rootShapeRegistration]) return;
    Blockly.Extensions.register(embeddedYamlRootShapeExtension, function () {
        this.setPreviousStatement(false);
        this.setNextStatement(false);
    });
    Object.defineProperty(Blockly, rootShapeRegistration, {value: true});
}
/** An inert, independently placed entry reference; its content lives in ordinary document hats. */
export function createEmbeddedYamlRootHatDefinition(options: EmbeddedYamlRootHatOptions): EmbeddedYamlRootHatDefinition {
    identifier(options.defaultVersion, 'defaultVersion');
    const versionMenuName=identifier(options.versionMenuName ?? 'embeddedYamlVersions','versionMenuName');
    const definition = createEmbeddedYamlHatDefinition({...options, operation: options.operation ?? 'embeddedYamlRoot'});
    return Object.freeze({...definition, text: 'embedded YAML root [VERSION] [DOCUMENT]', isTerminal: true,
        arguments: Object.freeze({...definition.arguments, VERSION:Object.freeze({type:'string',menu:versionMenuName,defaultValue:options.defaultVersion})}),
        extensions: Object.freeze([embeddedYamlRootShapeExtension])} as const);
}

/** Versions are owner-defined literal choices; the generic library does not interpret them. */
export function createEmbeddedYamlRootVersionMenu(versions: readonly string[]): EmbeddedYamlMenu {
    if (!Array.isArray(versions) || !versions.length || versions.length > 64) fail('HAT_INVALID','A bounded nonempty version list is required.');
    const seen=new Set<string>();
    const items=versions.map(version=>{
        identifier(version,'VERSION');
        if(seen.has(version)) fail('HAT_INVALID','Version choices must be unique.');
        seen.add(version);return Object.freeze({text:version,value:version});
    });
    return Object.freeze({acceptReporters:false,items:Object.freeze(items)});
}
