import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
// The facade compiles against the canonical declarations, so the canonical package comes first.
const projects = [
  { output: "dist", config: "tsconfig.build.json" },
  { output: "compat/embedded-yaml/dist", config: "compat/embedded-yaml/tsconfig.json" },
];
for (const { output, config } of projects) {
  // Remove stale modules that no longer have a source file.
  rmSync(new URL(`../${output}`, import.meta.url), { recursive: true, force: true });
  execFileSync(process.execPath, [tsc, "-p", config], { cwd: root, stdio: "inherit" });
}
