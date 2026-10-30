import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { mkdtemp, readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  archiveLimits,
  assertSameExpandedTar,
  verifyNpmArchive,
  selectCanonicalArchive,
  registryTarballURL,
  fetchNpmMetadata,
  fetchNpmArchive,
  verifyReleaseSource,
} from "../scripts/release-canonical-archive.mjs";
const name = "@example/package",
  version = "0.1.0-rc.0";
const tar = Buffer.from(
  "header and metadata\0file contents\0padding".repeat(20),
);
const a = gzipSync(tar, { level: 1 }),
  b = gzipSync(tar, { level: 9 });
const digest = (algorithm, bytes, encoding) =>
  createHash(algorithm).update(bytes).digest(encoding);
const metadata = (bytes) => ({
  name,
  version,
  dist: {
    tarball:
      "https://registry.npmjs.org/@example/package/-/package-0.1.0-rc.0.tgz",
    shasum: digest("sha1", bytes, "hex"),
    integrity: "sha512-" + digest("sha512", bytes, "base64"),
  },
});

test("only gzip encoding may differ; all expanded tar bytes including metadata and padding must match", () => {
  assert.notDeepEqual(a, b);
  assert.equal(assertSameExpandedTar(a, b).tarBytes, tar.length);
  for (const other of [
    gzipSync(Buffer.concat([tar, Buffer.from([0])])),
    gzipSync(Buffer.from(tar).fill(1, 5, 6)),
  ])
    assert.throws(() => assertSameExpandedTar(a, other), /differ/);
});
test("compressed size, expanded size and corrupt gzip are bounded", () => {
  assert.throws(
    () => assertSameExpandedTar(a, b, { ...archiveLimits, compressedBytes: 4 }),
    /invalid|limit/,
  );
  assert.throws(
    () => assertSameExpandedTar(a, b, { ...archiveLimits, tarBytes: 4 }),
    /invalid|limit/,
  );
  assert.throws(() => assertSameExpandedTar(Buffer.from("bad"), b), /invalid/);
});
test("published bytes require both exact SHA-1 and supported canonical SRI plus identity", () => {
  assert.deepEqual(verifyNpmArchive(metadata(b), b, { name, version }), b);
  for (const change of [
    (m) => (m.name = "other"),
    (m) => (m.version = "9.0.0"),
    (m) => (m.dist.shasum = "0".repeat(40)),
    (m) => (m.dist.integrity = "sha512-" + Buffer.alloc(64).toString("base64")),
    (m) => delete m.dist.integrity,
    (m) => (m.dist.integrity = "sha1-bad"),
    (m) => (m.dist.integrity += " sha256-YmFk"),
  ]) {
    const m = metadata(b);
    change(m);
    assert.throws(() => verifyNpmArchive(m, b, { name, version }));
  }
});
test("published registry bytes become canonical only after integrity and full expanded-tar equality", async () => {
  const result = await selectCanonicalArchive({
    candidate: a,
    metadata: metadata(b),
    name,
    version,
    fetchArchive: async () => b,
  });
  assert.equal(result.published, true);
  assert.deepEqual(result.archive, b);
  await assert.rejects(
    selectCanonicalArchive({
      candidate: gzipSync(Buffer.from("different source")),
      metadata: metadata(b),
      name,
      version,
      fetchArchive: async () => b,
    }),
    /differ/,
  );
  let fetched = false;
  const absent = await selectCanonicalArchive({
    candidate: a,
    metadata: null,
    name,
    version,
    fetchArchive: async () => {
      fetched = true;
      return b;
    },
  });
  assert.equal(absent.published, false);
  assert.deepEqual(absent.archive, a);
  assert.equal(fetched, false);
});
test("only HTTPS npm registry archives without credentials, ports, queries or redirects are fetched", async () => {
  for (const url of [
    "http://registry.npmjs.org/p.tgz",
    "https://example.com/p.tgz",
    "https://registry.npmjs.org.evil/p",
    "https://user:secret@registry.npmjs.org/p",
    "https://registry.npmjs.org:444/p",
    "https://registry.npmjs.org/p?token=x",
    "https://registry.npmjs.org/p#x",
  ])
    assert.throws(() => registryTarballURL(url));
  let options;
  await fetchNpmArchive(metadata(b).dist.tarball, {
    fetcher: async (_url, init) => {
      options = init;
      return new Response(b);
    },
  });
  assert.equal(options.redirect, "error");
  assert(options.signal instanceof AbortSignal);
});
test("404 alone means unpublished; network, HTTP and metadata-body failures never imply absence", async () => {
  assert.equal(
    await fetchNpmMetadata(name, version, {
      fetcher: async () => new Response("", { status: 404 }),
    }),
    null,
  );
  for (const fetcher of [
    async () => {
      throw Error("network");
    },
    async () => new Response("", { status: 503 }),
    async () => new Response("not json"),
  ])
    await assert.rejects(fetchNpmMetadata(name, version, { fetcher }));
  await assert.rejects(
    fetchNpmMetadata(name, version, {
      fetcher: async () => new Response("x".repeat(100)),
      limits: { ...archiveLimits, metadataBytes: 8 },
    }),
    /limit/,
  );
  await assert.rejects(
    fetchNpmArchive(metadata(b).dist.tarball, {
      fetcher: async () => new Response(b),
      limits: { ...archiveLimits, compressedBytes: 4 },
    }),
    /limit/,
  );
});
async function repository(run) {
  const cwd = await mkdtemp(path.join(tmpdir(), "release-source-"));
  const git = (...args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const put = async (file, text) => {
    await mkdir(path.dirname(path.join(cwd, file)), { recursive: true });
    await writeFile(path.join(cwd, file), text);
  };
  const commit = () => {
    git("add", ".");
    git(
      "-c",
      "user.name=Release test",
      "-c",
      "user.email=test@example.invalid",
      "commit",
      "-m",
      "fixture",
    );
  };
  try {
    git("init", "--initial-branch=main");
    await put(
      "package.json",
      JSON.stringify({ name, version, files: ["src", "README.md", "LICENSE"] }),
    );
    await put("src/index.js", "export const value=1;");
    await put("README.md", "readme");
    await put("LICENSE", "license");
    commit();
    git("tag", "v" + version);
    await run({ cwd, git, put, commit });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}
test("tag mode requires exactly the tagged commit and clean checkout", async () =>
  repository(async ({ cwd, put, commit }) => {
    assert.equal(
      (await verifyReleaseSource({ cwd, tag: "v" + version })).changed.length,
      0,
    );
    await assert.rejects(
      verifyReleaseSource({ cwd, tag: "v9.0.0" }),
      /version/,
    );
    await put("scripts/helper.mjs", "export {};");
    await assert.rejects(
      verifyReleaseSource({ cwd, tag: "v" + version }),
      /clean/,
    );
    commit();
    await assert.rejects(
      verifyReleaseSource({ cwd, tag: "v" + version }),
      /tagged/,
    );
  }));
test("dispatch accepts only non-published workflow/script/test changes and requires the existing exact version tag", async () =>
  repository(async ({ cwd, put, commit }) => {
    await put("scripts/helper.mjs", "export {};");
    await put("test/helper.test.mjs", "export {};");
    await put(".github/workflows/release.yml", "name: Release");
    commit();
    const result = await verifyReleaseSource({
      cwd,
      tag: "v" + version,
      dispatch: true,
    });
    assert.equal(result.changed.length, 3);
    await put("README.md", "changed");
    commit();
    await assert.rejects(
      verifyReleaseSource({ cwd, tag: "v" + version, dispatch: true }),
      /source/,
    );
  }));
test("dispatch refuses production bytes, package metadata and published paths even if under scripts", async () => {
  for (const file of ["src/index.js", "package.json", "LICENSE"])
    await repository(async ({ cwd, put, commit }) => {
      await put(
        file,
        file === "package.json"
          ? JSON.stringify({
              name,
              version,
              files: ["src", "README.md", "LICENSE"],
              description: "changed",
            })
          : "changed",
      );
      commit();
      await assert.rejects(
        verifyReleaseSource({ cwd, tag: "v" + version, dispatch: true }),
        /source/,
      );
    });
  await repository(async ({ cwd, put, commit, git }) => {
    await put(
      "package.json",
      JSON.stringify({ name, version, files: ["src", "scripts"] }),
    );
    await put("scripts/published.mjs", "old");
    commit();
    git("tag", "-f", "v" + version);
    await put("scripts/published.mjs", "new");
    commit();
    await assert.rejects(
      verifyReleaseSource({ cwd, tag: "v" + version, dispatch: true }),
      /source/,
    );
  });
});
test("workflow retains main checks, canonical integrity gate and verified-only clobber without republishing an existing version", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/release.yml", import.meta.url),
    "utf8",
  );
  for (const text of [
    "workflow_dispatch:",
    "fetch-depth: 0",
    "git ls-remote --exit-code origin refs/heads/main",
    'test "$main" = "$GITHUB_SHA"',
    'verify-source --tag "$RELEASE_TAG" --dispatch',
    "canonical-report.json",
    "release-canonical-archive.mjs compare",
    'gh release upload "$RELEASE_TAG" "$NPM_ARCHIVE" --clobber',
    "r.published ? 0 : 1",
  ])
    assert(workflow.includes(text), text);
  assert(
    workflow.indexOf("release-canonical-archive.mjs compare") <
      workflow.indexOf("--clobber"),
  );
});
