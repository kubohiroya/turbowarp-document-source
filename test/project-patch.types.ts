import {
    prepareProjectPatch,
    applyProjectPatch,
    canPatchProject,
    installProjectPatchWorkspaceAdapter,
    type ProjectPatchTargetChange,
} from '../src/project-patch.js';
const vm: any = {};
const possible: boolean = canPatchProject(vm);
const dispose = installProjectPatchWorkspaceAdapter(vm, {
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
