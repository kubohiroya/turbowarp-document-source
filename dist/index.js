export * from "./document-source.js";
export { SourceDocumentError, SourceDocumentError as EmbeddedYamlError, encodeSourceDocumentReference, encodeSourceDocumentReference as encodeReference, decodeSourceDocumentReference, decodeSourceDocumentReference as decodeReference } from "./wire.js";
export { readReference, readReference as readDocumentSourceReference } from "./reference.js";
export { normalizeSourceDocumentSchema, normalizeSourceDocumentSchema as normalizeSchemaMetadata, sourceDocumentSchemaLimits, sourceDocumentSchemaLimits as embeddedYamlSchemaLimits } from "./schema.js";
export { normalizeSourceDocumentPreview } from "./preview.js";
export { validateEmbeddedYamlFilename, validateEmbeddedYamlRelativePath } from "./filename.js";
export const sourceDocumentRegistrySymbol = Symbol.for('@kubohiroya/turbowarp-embedded-yaml/provider-registry/v1');
export const providerRegistrySymbol = sourceDocumentRegistrySymbol;
