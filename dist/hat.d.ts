import type { SourceDocumentReference, RegisteredSourceDocumentMetadata } from '@kubohiroya/turbowarp-document-data/composition';
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
export type EmbeddedYamlMenuArgument = Readonly<{
    type: 'string';
    menu: string;
    defaultValue: string;
}>;
export type EmbeddedYamlHatDefinition = Readonly<{
    opcode: string;
    blockType: string;
    text: string;
    isEdgeActivated: false;
    blockIconURI: string;
    arguments: Readonly<{
        DOCUMENT: EmbeddedYamlMenuArgument;
    }>;
}>;
export type EmbeddedYamlRootHatDefinition = EmbeddedYamlHatDefinition & Readonly<{
    isTerminal: true;
    extensions: readonly string[];
    arguments: EmbeddedYamlHatDefinition['arguments'] & Readonly<{
        VERSION: EmbeddedYamlMenuArgument;
    }>;
}>;
export type EmbeddedYamlMenu = Readonly<{
    acceptReporters: false;
    items: readonly Readonly<{
        text: string;
        value: string;
    }>[];
}>;
/** The part of ScratchBlocks used to register the disconnected root shape. */
export interface EmbeddedYamlRootShapeHost {
    Extensions: {
        register(name: string, initializer: (this: {
            setPreviousStatement(value: boolean): void;
            setNextStatement(value: boolean): void;
        }) => void): void;
    };
}
export declare function createEmbeddedYamlHatDefinition({ BlockType, operation, menuName, defaultReference }: EmbeddedYamlHatOptions): EmbeddedYamlHatDefinition;
export declare function createEmbeddedYamlDocumentMenu(documents: readonly RegisteredSourceDocumentMetadata[]): EmbeddedYamlMenu;
export declare const embeddedYamlRootShapeExtension = "tw_embedded_yaml_root_shape_v1";
export declare const embeddedYamlRootHatShapeExtension = "tw_embedded_yaml_root_shape_v1";
/** Register through the supported ScratchBlocks extension API before root block initialization. */
export declare function registerEmbeddedYamlRootHatShape(Blockly: EmbeddedYamlRootShapeHost): void;
/** An inert, independently placed entry reference; its content lives in ordinary document hats. */
export declare function createEmbeddedYamlRootHatDefinition(options: EmbeddedYamlRootHatOptions): EmbeddedYamlRootHatDefinition;
/** Versions are owner-defined literal choices; the generic library does not interpret them. */
export declare function createEmbeddedYamlRootVersionMenu(versions: readonly string[]): EmbeddedYamlMenu;
