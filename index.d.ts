export {
  SourceDocumentError as EmbeddedYamlError,
  encodeSourceDocumentReference as encodeReference,
  decodeSourceDocumentReference as decodeReference,
  createSourceDocumentRegistry as createProviderRegistry,
  getSourceDocumentRegistry as getProviderRegistry,
  sourceDocumentRegistrySymbol as providerRegistrySymbol,
  normalizeSourceDocumentSchema as normalizeSchemaMetadata,
  sourceDocumentSchemaLimits as embeddedYamlSchemaLimits
} from '@kubohiroya/turbowarp-document-data/composition';
export type {
  SourceDocumentSchemaMetadata as EmbeddedYamlSchemaMetadata,
  SourceDocumentReference as EmbeddedYamlReference,
  SourceDocumentMetadata as EmbeddedYamlMetadata,
  RegisteredSourceDocumentMetadata as RegisteredEmbeddedYamlMetadata,
  SourceDocumentAvailability as EmbeddedYamlAvailability,
  SourceDocumentSnapshot as EmbeddedYamlSnapshot,
  SourceDocumentPrepared as EmbeddedYamlPrepared,
  SourceDocumentAdapter as EmbeddedYamlDocumentAdapter,
  SourceDocumentProvider as EmbeddedYamlProvider,
  SourceDocumentRegistry as EmbeddedYamlProviderRegistry
} from '@kubohiroya/turbowarp-document-data/composition';
import type {
  SourceDocumentReference as EmbeddedYamlReference,
  RegisteredSourceDocumentMetadata as RegisteredEmbeddedYamlMetadata
} from '@kubohiroya/turbowarp-document-data/composition';
export const embeddedYamlFileIconURI: string;
export const yamlBlockIconURI: string;
/** Reads only static DOCUMENT fields or literal shadows; never evaluates a reporter. */
export function readReference(block: any, target?: any): EmbeddedYamlReference;
export interface EmbeddedYamlHatOptions {
  readonly BlockType: Readonly<Record<string, string>>;
  readonly operation?: string;
  readonly menuName?: string;
  readonly defaultReference: EmbeddedYamlReference;
}
export function createEmbeddedYamlHatDefinition(options: EmbeddedYamlHatOptions): Readonly<{
  opcode: string; blockType: string; text: string; isEdgeActivated: false; blockIconURI: string;
  arguments: Readonly<{DOCUMENT: Readonly<{type: 'string'; menu: string; defaultValue: string}>}>;
}>;
export function createEmbeddedYamlDocumentMenu(documents: readonly RegisteredEmbeddedYamlMetadata[]): Readonly<{
  acceptReporters: false; items: readonly Readonly<{text: string; value: string}>[];
}>;
export interface EmbeddedYamlMarkerOptions {
  readonly opcode: string;
  readonly reference: EmbeddedYamlReference;
  readonly x?: number;
  readonly y?: number;
}
export function createEmbeddedYamlMarker(options: EmbeddedYamlMarkerOptions): Record<string, unknown>;
/** Mutates the caller-owned project copy, preserving all unrelated blocks and storage. */
export function installEmbeddedYamlMarker(project: Record<string, unknown>, options: EmbeddedYamlMarkerOptions): string;
export function removeEmbeddedYamlMarkers(project: Record<string, unknown>, options: {readonly opcodes: readonly string[]}): number;
/** Register before root block construction; uses ScratchBlocks' standard JSON extension hook. */
export function registerEmbeddedYamlRootHatShape(Blockly: any): void;
export const embeddedYamlRootShapeExtension: string;
export const embeddedYamlRootHatShapeExtension: string;
export function createEmbeddedYamlRootVersionMenu(versions:readonly string[]): Readonly<{acceptReporters:false;items:readonly Readonly<{text:string;value:string}>[]}>;
export function createEmbeddedYamlRootHatDefinition(options: EmbeddedYamlHatOptions & {readonly defaultVersion:string;readonly versionMenuName?:string}): ReturnType<typeof createEmbeddedYamlHatDefinition> & Readonly<{isTerminal:true;extensions:readonly string[];arguments: ReturnType<typeof createEmbeddedYamlHatDefinition>['arguments'] & Readonly<{VERSION:Readonly<{type:'string';menu:string;defaultValue:string}>}>}>;
export function validateEmbeddedYamlFilename(filename: string): string;
export function validateEmbeddedYamlRelativePath(path: string): string;
export function createEmbeddedYamlRootMarker(options: EmbeddedYamlMarkerOptions & {readonly version:string}): Record<string, unknown>;
export function validateEmbeddedYamlRootMarker(block: unknown, options?: {readonly opcode?:string;readonly target?:unknown}): EmbeddedYamlReference;
export function installEmbeddedYamlRootMarker(project: Record<string,unknown>, options: EmbeddedYamlMarkerOptions & {readonly version:string}): string;

export function readEmbeddedYamlRootVersion(block: unknown): string;

export * from './src/document-source.js';
export function createDocumentSourceHatDefinition(options: EmbeddedYamlHatOptions & {readonly text?:string}): ReturnType<typeof createEmbeddedYamlHatDefinition>;
export function createDocumentSourceRootHatDefinition(options: EmbeddedYamlHatOptions & {readonly defaultVersion:string;readonly versionMenuName?:string;readonly text?:string}): ReturnType<typeof createEmbeddedYamlRootHatDefinition>;
export {readReference as readDocumentSourceReference, createEmbeddedYamlDocumentMenu as createDocumentSourceMenu, registerEmbeddedYamlRootHatShape as registerDocumentSourceRootHatShape, createEmbeddedYamlMarker as createDocumentSourceMarker, installEmbeddedYamlMarker as installDocumentSourceMarker, createEmbeddedYamlRootMarker as createDocumentSourceRootMarker, installEmbeddedYamlRootMarker as installDocumentSourceRootMarker};
