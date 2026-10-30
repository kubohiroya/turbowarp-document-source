import { EventEmitter } from "node:events";
export function patchVm(project) {
  const counts = {
    saves: 0,
    loads: 0,
    stops: 0,
    changes: 0,
    resets: 0,
    notifications: 0,
  };
  const runtime = Object.assign(new EventEmitter(), {
    extensionStorage: project.extensionStorage,
    emitProjectChanged() {
      counts.changes++;
      runtime.emit("PROJECT_CHANGED");
    },
  });
  const targets = project.targets.map((serialized, index) => {
    const dictionary = {};
    for (const [id, source] of Object.entries(serialized.blocks || {}))
      dictionary[id] = {
        next: null,
        parent: null,
        inputs: {},
        fields: {},
        topLevel: true,
        shadow: false,
        ...structuredClone(source),
        id,
      };
    const blocks = {
      _blocks: dictionary,
      getBlock: (id) => dictionary[id],
      createBlock(block) {
        dictionary[block.id] = block;
      },
      deleteBlock(id) {
        delete dictionary[id];
      },
      resetCache() {
        counts.resets++;
      },
      getScripts: () =>
        Object.values(dictionary)
          .filter((block) => block.topLevel)
          .map((block) => block.id),
      forceNoGlow: false,
    };
    Object.defineProperty(serialized, "blocks", {
      enumerable: true,
      configurable: true,
      get: () =>
        Object.fromEntries(
          Object.entries(dictionary).map(([id, block]) => {
            const result = { ...block };
            delete result.id;
            result.fields = Object.fromEntries(
              Object.entries(block.fields || {}).map(([key, field]) => [
                key,
                Array.isArray(field)
                  ? field
                  : [
                      field.value,
                      ...(field.id === undefined ? [] : [field.id]),
                    ],
              ]),
            );
            return [id, result];
          }),
        ),
    });
    serialized.comments ??= {};
    return {
      id: `target-${index}`,
      isOriginal: true,
      isStage: serialized.isStage,
      name: serialized.name,
      getName: () => serialized.name,
      blocks,
      comments: serialized.comments,
      sprite: {
        costumes: serialized.costumes || [],
        sounds: serialized.sounds || [],
      },
      variables: serialized.variables || {},
      createComment(id, blockId, text, x, y, width, height, minimized) {
        this.comments[id] = { blockId, text, x, y, width, height, minimized };
      },
    };
  });
  runtime.targets = targets;
  const vm = {
    runtime,
    toJSON: () => JSON.stringify(project),
    stopAll() {
      counts.stops++;
    },
    saveProjectSb3() {
      counts.saves++;
      throw Error("Full archive saving is forbidden.");
    },
    loadProject() {
      counts.loads++;
      throw Error("Full project loading is forbidden.");
    },
    emit() {
      counts.notifications++;
    },
    extensionManager: { isExtensionLoaded: () => true },
    securityManager: { canLoadExtensionFromProject: async () => true },
  };
  return { vm, counts, targets, project };
}
