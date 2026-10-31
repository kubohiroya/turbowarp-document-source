import { type EmbeddedYamlHatOptions, type EmbeddedYamlRootHatOptions, type EmbeddedYamlHatDefinition, type EmbeddedYamlRootHatDefinition } from './hat.ts';
/** Stable document identity is independent of its location and representation. */
export declare function createDocumentSourceHatDefinition(options: EmbeddedYamlHatOptions & {
    readonly text?: string;
}): EmbeddedYamlHatDefinition;
/** Preserve the disconnected root shape and owner-defined version choices. */
export declare function createDocumentSourceRootHatDefinition(options: EmbeddedYamlRootHatOptions & {
    readonly text?: string;
}): EmbeddedYamlRootHatDefinition;
