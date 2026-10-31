/** Minimal synchronous VM transactions. This module never saves or loads an SB3 archive. */
export declare const projectPatchWorkspaceAdapterSymbol: unique symbol;
export interface ProjectPatchTargetChange {
    readonly targetId: string;
    readonly beforeRootIds: readonly string[];
    readonly afterRootIds: readonly string[];
    readonly changedBlockIds: readonly string[];
    readonly changedCommentIds: readonly string[];
}
export interface ProjectPatchWorkspaceAdapter {
    /** Synchronously attest a registered public GUI block definition; only used for shadows. */
    hasBlockDefinition?(type: string): boolean;
    prepare(input: {
        readonly targetChanges: readonly ProjectPatchTargetChange[];
    }): {
        apply(): void;
        rollback(): void;
    };
}
export interface PreparedProjectPatch {
    readonly projectPatch: true;
}
export interface ProjectPatchResult {
    projectPatched: true;
    changedTargets: readonly ProjectPatchTargetChange[];
    changedStoragePaths: string[][];
}
export declare function installProjectPatchWorkspaceAdapter(vm: unknown, adapter: ProjectPatchWorkspaceAdapter): () => void;
export declare function canPatchProject(vm: unknown): boolean;
/** Validate and approve prerequisites only; no blocks, storage or archive are changed. */
export declare function prepareProjectPatch({ vm, baseProject, candidateProject, assertCurrent, }: {
    vm: unknown;
    baseProject: Record<string, any>;
    candidateProject: Record<string, any>;
    assertCurrent(): void;
}): Promise<PreparedProjectPatch>;
/** Apply one prepared patch synchronously; restore original objects on any failure. */
export declare function applyProjectPatch(token: PreparedProjectPatch): ProjectPatchResult;
