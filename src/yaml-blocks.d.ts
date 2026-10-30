import type { SourceDocumentReference } from '@kubohiroya/turbowarp-document-data/composition';
import type { SourceSyntaxNode as YamlSyntaxNode } from '@kubohiroya/turbowarp-yaml-json/source-syntax';
export type {
    SourceSyntaxNode as YamlSyntaxNode,
    SourceSyntaxComment as YamlCommentNode,
    SourceSyntaxScalar as YamlScalarNode,
    SourceSyntaxPair as YamlPairNode,
} from '@kubohiroya/turbowarp-yaml-json/source-syntax';
export interface YamlBlockOpcodes {
    map: string;
    pair: string;
    sequence: string;
    item: string;
    scalar: string;
    text: string;
    textLine: string;
    comment: string;
    /** Optional for existing legacy custom opcode maps; newly generated maps provide both. */
    lineComment?: string;
    inlineComment?: string;
}
export interface YamlViewDescriptor {
    version: 2;
    reference: SourceDocumentReference;
    rootOpcode: string;
    opcodes: YamlBlockOpcodes;
    syntaxIdsByPath: Record<string, string>;
    baseSourceRevision?: string;
}
export const yamlBlockIconURI: string;
export const yamlBlockOperations: Readonly<YamlBlockOpcodes>;
export interface YamlBlockDefinition {
    opcode: string;
    blockType: 'command';
    blockIconURI: string;
    hideFromPalette?: boolean;
    branchCount?: 1;
    text: string;
    arguments: Record<string, { type: 'string'; defaultValue: string; menu?: string }>;
}
export function createYamlBlockDefinitions(): YamlBlockDefinition[];
export function createYamlBlockMenus(): Record<
    'yamlScalarTypes' | 'yamlCommentPlacements' | 'yamlLineCommentPlacements' | 'yamlLineBreaks',
    { acceptReporters: false; items: string[] }
>;
export function createYamlBlockOpcodes(prefix?: string): Readonly<YamlBlockOpcodes>;
export function createYamlBlockView(options: {
    reference: SourceDocumentReference;
    tree: YamlSyntaxNode;
    rootId: string;
    rootOpcode: string;
    opcodes?: YamlBlockOpcodes;
    idPrefix?: string;
    x?: number;
    y?: number;
}): {
    blocks: Record<string, any>;
    rootId: string;
    nodeIds: Record<string, string>;
    keyIds: Record<string, string>;
    descriptor: YamlViewDescriptor;
};
export function readYamlBlockView(options: {
    blocks: Record<string, any>;
    descriptor: YamlViewDescriptor;
}): YamlSyntaxNode;
