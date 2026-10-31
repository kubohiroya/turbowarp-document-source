import {createEmbeddedYamlHatDefinition, createEmbeddedYamlRootHatDefinition, type EmbeddedYamlHatOptions, type EmbeddedYamlRootHatOptions, type EmbeddedYamlHatDefinition, type EmbeddedYamlRootHatDefinition} from './hat.ts';

/** Stable document identity is independent of its location and representation. */
export function createDocumentSourceHatDefinition(options: EmbeddedYamlHatOptions & {readonly text?: string}): EmbeddedYamlHatDefinition {
    return Object.freeze({...createEmbeddedYamlHatDefinition({...options, operation: options.operation ?? 'documentSource'}),
        text: options.text ?? 'data source [DOCUMENT]'});
}
/** Preserve the disconnected root shape and owner-defined version choices. */
export function createDocumentSourceRootHatDefinition(options: EmbeddedYamlRootHatOptions & {readonly text?: string}): EmbeddedYamlRootHatDefinition {
    return Object.freeze({...createEmbeddedYamlRootHatDefinition({...options, operation: options.operation ?? 'documentSourceRoot'}),
        text: options.text ?? 'data source root [VERSION] [DOCUMENT]'});
}
