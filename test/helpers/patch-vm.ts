import { EventEmitter } from "node:events";
/** A live scratch-vm block record; tests inspect arbitrary serialized fields. */
export type PatchVmBlock = Record<string, any> & { id: string };
export interface PatchVmTarget {
  id: string;
  isOriginal: boolean;
  isStage: boolean | undefined;
  name: string | undefined;
  getName(): string | undefined;
  blocks: {
    _blocks: Record<string, PatchVmBlock>;
    getBlock(id: string): PatchVmBlock | undefined;
    createBlock(block: PatchVmBlock): void;
    deleteBlock(id: string): void;
    resetCache(): void;
    getScripts(): string[];
    forceNoGlow: boolean;
  };
  comments: Record<string, any>;
  sprite: { costumes: unknown[]; sounds: unknown[] };
  variables: Record<string, unknown>;
  createComment(
    id: string,
    blockId: string | null | undefined,
    text: string,
    x: number,
    y: number,
    width: number,
    height: number,
    minimized: boolean,
  ): void;
}
export function patchVm(project: Record<string, any>) {
  const counts = {
    saves: 0,
    loads: 0,
    stops: 0,
    changes: 0,
    resets: 0,
    notifications: 0,
  };
  const runtime = Object.assign(new EventEmitter(), {
    extensionStorage: project.extensionStorage as Record<string, any>,
    targets: [] as PatchVmTarget[],
    emitProjectChanged() {
      counts.changes++;
      runtime.emit("PROJECT_CHANGED");
    },
  });
  const targets: PatchVmTarget[] = project.targets.map(
    (serialized: Record<string, any>, index: number): PatchVmTarget => {
      const dictionary: Record<string, PatchVmBlock> = {};
      for (const [id, source] of Object.entries(serialized.blocks || {}))
        dictionary[id] = {
          next: null,
          parent: null,
          inputs: {},
          fields: {},
          topLevel: true,
          shadow: false,
          ...structuredClone(source as object),
          id,
        };
      const blocks: PatchVmTarget["blocks"] = {
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
              const result: Record<string, any> = { ...block };
              delete result.id;
              result.fields = Object.fromEntries(
                Object.entries(block.fields || {}).map(
                  ([key, field]: [string, any]) => [
                    key,
                    Array.isArray(field)
                      ? field
                      : [
                          field.value,
                          ...(field.id === undefined ? [] : [field.id]),
                        ],
                  ],
                ),
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
    },
  );
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
