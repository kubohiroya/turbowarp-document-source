import {createEmbeddedYamlHatDefinition, createEmbeddedYamlRootHatDefinition} from './hat.js';

/** Stable document identity is independent of its location and representation. */
export function createDocumentSourceHatDefinition(options) {
    return Object.freeze({...createEmbeddedYamlHatDefinition({...options, operation: options.operation ?? 'documentSource'}),
        text: options.text ?? 'data source [DOCUMENT]'});
}
/** Preserve the disconnected root shape and owner-defined version choices. */
export function createDocumentSourceRootHatDefinition(options) {
    return Object.freeze({...createEmbeddedYamlRootHatDefinition({...options, operation: options.operation ?? 'documentSourceRoot'}),
        text: options.text ?? 'data source root [VERSION] [DOCUMENT]'});
}
