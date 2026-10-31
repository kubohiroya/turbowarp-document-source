export {EmbeddedYamlError, encodeReference, decodeReference, readReference} from './src/reference.js';
export {embeddedYamlFileIconURI, yamlBlockIconURI} from './src/icon.js';
export {createEmbeddedYamlHatDefinition, createEmbeddedYamlDocumentMenu} from './src/hat.js';
export {createEmbeddedYamlMarker, installEmbeddedYamlMarker, removeEmbeddedYamlMarkers} from './src/marker.js';
export {createProviderRegistry, getProviderRegistry, providerRegistrySymbol} from './src/registry.js';
export {normalizeSchemaMetadata, embeddedYamlSchemaLimits} from './src/schema.js';
export {createEmbeddedYamlRootHatDefinition, registerEmbeddedYamlRootHatShape, embeddedYamlRootShapeExtension, embeddedYamlRootHatShapeExtension, createEmbeddedYamlRootVersionMenu} from './src/hat.js';
export {createEmbeddedYamlRootMarker, validateEmbeddedYamlRootMarker, readEmbeddedYamlRootVersion, installEmbeddedYamlRootMarker} from './src/marker.js';
export {validateEmbeddedYamlFilename, validateEmbeddedYamlRelativePath} from './src/filename.js';

export {normalizeDocumentSource, normalizeDocumentSourceURL, documentSourceModes, documentSourceStorageKey, readDocumentSourceURLs, writeDocumentSourceURL, fetchDocumentSource} from './src/document-source.js';
export {getDocumentSourceRegistry} from './src/source-registry.js';
export {createDocumentSourceHatDefinition, createDocumentSourceRootHatDefinition} from './src/source-hat.js';
export {readReference as readDocumentSourceReference} from './src/reference.js';
export {createEmbeddedYamlDocumentMenu as createDocumentSourceMenu, registerEmbeddedYamlRootHatShape as registerDocumentSourceRootHatShape} from './src/hat.js';
export {createEmbeddedYamlMarker as createDocumentSourceMarker, installEmbeddedYamlMarker as installDocumentSourceMarker, createEmbeddedYamlRootMarker as createDocumentSourceRootMarker, installEmbeddedYamlRootMarker as installDocumentSourceRootMarker} from './src/marker.js';
