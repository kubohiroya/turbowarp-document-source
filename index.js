export {EmbeddedYamlError, encodeReference, decodeReference, readReference} from './src/reference.js';
export {embeddedYamlFileIconURI, yamlBlockIconURI} from './src/icon.js';
export {createEmbeddedYamlHatDefinition, createEmbeddedYamlDocumentMenu} from './src/hat.js';
export {createEmbeddedYamlMarker, installEmbeddedYamlMarker, removeEmbeddedYamlMarkers} from './src/marker.js';
export {createProviderRegistry, getProviderRegistry, providerRegistrySymbol} from './src/registry.js';
export {normalizeSchemaMetadata, embeddedYamlSchemaLimits} from './src/schema.js';
export {createEmbeddedYamlRootHatDefinition, registerEmbeddedYamlRootHatShape, embeddedYamlRootShapeExtension, embeddedYamlRootHatShapeExtension, createEmbeddedYamlRootVersionMenu} from './src/hat.js';
export {createEmbeddedYamlRootMarker, validateEmbeddedYamlRootMarker, readEmbeddedYamlRootVersion, installEmbeddedYamlRootMarker} from './src/marker.js';
export {validateEmbeddedYamlFilename, validateEmbeddedYamlRelativePath} from './src/filename.js';
