export const projectPatchWorkspaceAdapterSymbol: symbol;
export interface ProjectPatchTargetChange {
    readonly targetId: string;
    readonly beforeRootIds: readonly string[];
    readonly afterRootIds: readonly string[];
    readonly changedBlockIds: readonly string[];
    readonly changedCommentIds: readonly string[];
}
export interface ProjectPatchWorkspaceAdapter {
    prepare(input: { readonly targetChanges: readonly ProjectPatchTargetChange[] }): {
        apply(): void;
        rollback(): void;
    };
}
export function installProjectPatchWorkspaceAdapter(
    vm: any,
    adapter: ProjectPatchWorkspaceAdapter,
): () => void;
export function canPatchProject(vm: any): boolean;
export interface PreparedProjectPatch {
    readonly projectPatch: true;
}
export function prepareProjectPatch(input: {
    vm: any;
    baseProject: Record<string, any>;
    candidateProject: Record<string, any>;
    assertCurrent(): void;
}): Promise<PreparedProjectPatch>;
export function applyProjectPatch(patch: PreparedProjectPatch): {
    projectPatched: true;
    changedTargets: readonly ProjectPatchTargetChange[];
    changedStoragePaths: string[][];
};
