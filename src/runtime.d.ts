export const yamlBlockRuntimeId: 'kubohiroyaembeddedyaml';
export function createYamlBlockRuntime(
    Scratch: { BlockType: Record<string, string> },
    options?: { enabled?: boolean }
): { getInfo(): Record<string, unknown>; [operation: string]: unknown };
