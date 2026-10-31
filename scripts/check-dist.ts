import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Git-pinned consumers install the committed output without building it.
const root = fileURLToPath(new URL("../", import.meta.url));
const outputs = ["dist", "compat/embedded-yaml/dist"];
const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
execFileSync(process.execPath, ["scripts/build.ts"], { cwd: root, stdio: "inherit" });
// Compare against the index, so freshly staged output passes before it is committed.
const stale = [
  ...git("diff", "--name-only", "--", ...outputs).split("\n"),
  ...git("ls-files", "--others", "--exclude-standard", "--", ...outputs).split("\n"),
].filter(Boolean);
if (stale.length) {
  console.error(
    `The build output differs from the index. Run npm run build and commit:\n${stale.join("\n")}`,
  );
  process.exit(1);
}
