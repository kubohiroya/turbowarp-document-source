export type * from './types.ts';
export type {DocumentSourceVM} from './host.ts';
export * from './document-source.ts';
export {SourceDocumentError, SourceDocumentError as EmbeddedYamlError, encodeSourceDocumentReference, encodeSourceDocumentReference as encodeReference, decodeSourceDocumentReference, decodeSourceDocumentReference as decodeReference} from './wire.ts';
export {readReference, readReference as readDocumentSourceReference} from './reference.ts';
export type {ReferenceBlock, ReferenceTarget} from './reference.ts';
export {normalizeSourceDocumentSchema, normalizeSourceDocumentSchema as normalizeSchemaMetadata, sourceDocumentSchemaLimits, sourceDocumentSchemaLimits as embeddedYamlSchemaLimits} from './schema.ts';
export {normalizeSourceDocumentPreview} from './preview.ts';
export {validateEmbeddedYamlFilename, validateEmbeddedYamlRelativePath} from './filename.ts';
export const sourceDocumentRegistrySymbol = Symbol.for('@kubohiroya/turbowarp-embedded-yaml/provider-registry/v1');
export const providerRegistrySymbol = sourceDocumentRegistrySymbol;
export type {
 SourceDocumentReference as EmbeddedYamlReference, SourceDocumentMetadata as EmbeddedYamlMetadata,
 RegisteredSourceDocumentMetadata as RegisteredEmbeddedYamlMetadata,
 SourceDocumentAvailability as EmbeddedYamlAvailability, SourceDocumentSnapshot as EmbeddedYamlSnapshot,
 SourceDocumentPrepared as EmbeddedYamlPrepared, SourceDocumentAdapter as EmbeddedYamlDocumentAdapter,
 SourceDocumentProvider as EmbeddedYamlProvider, SourceDocumentRegistry as EmbeddedYamlProviderRegistry,
 SourceDocumentSchemaMetadata as EmbeddedYamlSchemaMetadata
} from './types.ts';
