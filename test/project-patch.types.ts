import {
    prepareProjectPatch,
    applyProjectPatch,
    canPatchProject,
    installProjectPatchWorkspaceAdapter,
    type ProjectPatchTargetChange,
} from '../src/project-patch.ts';
const vm: unknown = {};
const possible: boolean = canPatchProject(vm);
const dispose = installProjectPatchWorkspaceAdapter(vm, {
    hasBlockDefinition(type) {
        const blockType: string = type;
        return blockType === 'registered_menu';
    },
    prepare({ targetChanges }) {
        const changes: readonly ProjectPatchTargetChange[] = targetChanges;
        void changes;
        return { apply() {}, rollback() {} };
    },
});
const patch = await prepareProjectPatch({
    vm,
    baseProject: {},
    candidateProject: {},
    assertCurrent() {},
});
const applied: true = applyProjectPatch(patch).projectPatched;
dispose();
void [possible, applied];
