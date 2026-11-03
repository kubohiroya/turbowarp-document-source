export interface DocumentSourceVM {
    toJSON(optimize: undefined, options: {allowOptimization: false}): string;
    runtime: {
        extensionStorage: Record<string, unknown>;
        targets: readonly {isOriginal?: boolean}[];
        on?(event: string, listener: () => void): unknown;
        off?(event: string, listener: () => void): unknown;
    };
}
