import { type DocumentSourceRegistry } from './document-source.ts';
/** The VM surface read here; project patches verify the rest themselves. */
export interface DocumentSourceVM {
    toJSON(optimize: undefined, options: {
        allowOptimization: false;
    }): string;
    runtime: {
        extensionStorage: Record<string, unknown>;
        targets: readonly {
            isOriginal?: boolean;
        }[];
        on?(event: string, listener: () => void): unknown;
        off?(event: string, listener: () => void): unknown;
    };
}
/** Extends the canonical registry rather than creating a second source owner. */
export declare function getDocumentSourceRegistry(vm: DocumentSourceVM): DocumentSourceRegistry;
