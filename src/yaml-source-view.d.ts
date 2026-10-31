import type { SourceSyntaxBaseline } from '@kubohiroya/turbowarp-yaml-json/source-syntax';
import type { SourceDocumentReference } from '@kubohiroya/turbowarp-document-data/composition';
import type { YamlBlockOpcodes, YamlViewDescriptor, YamlSyntaxNode } from './yaml-blocks.js';
export function createYamlSourceBlockView(options: {
    source: string;
    format?: 'yaml' | 'json';
    sourceRevision?: string;
    reference: SourceDocumentReference;
    rootId: string;
    rootOpcode: string;
    opcodes?: YamlBlockOpcodes;
    idPrefix?: string;
    x?: number;
    y?: number;
}): {
    baseline: SourceSyntaxBaseline;
    blocks: Record<string, any>;
    rootId: string;
    nodeIds: Record<string, string>;
    keyIds: Record<string, string>;
    descriptor: YamlViewDescriptor;
};
export function readYamlSourceBlockView(options: {
    baseline?: SourceSyntaxBaseline;
    source?: string;
    format?: 'yaml' | 'json';
    blocks: Record<string, any>;
    descriptor: YamlViewDescriptor;
    sourceRevision?: string;
}): { source: string; format: 'yaml' | 'json'; tree: YamlSyntaxNode };
