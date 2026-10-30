import type {SourceDocumentProvider} from '@kubohiroya/turbowarp-document-data/composition';
import type {YamlBlockOpcodes} from './yaml-blocks.js';
/** Default OFF; callers register this provider and supply a fixed companion runtime URL. */
export function createEmbeddedDocumentProvider(vm: any, options?: {
    enabled?: boolean;
    companionURL: string;
    opcodes?: YamlBlockOpcodes;
}): SourceDocumentProvider;
