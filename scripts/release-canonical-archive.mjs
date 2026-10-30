import { createHash, timingSafeEqual } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

export const archiveLimits = Object.freeze({
  compressedBytes: 16 * 1024 * 1024,
  tarBytes: 64 * 1024 * 1024,
  metadataBytes: 1024 * 1024,
});
const fail = (message) => {
  throw new Error(message);
};
const hash = (algorithm, bytes) => createHash(algorithm).update(bytes).digest();
function archiveBytes(bytes, limits = archiveLimits) {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength === 0 ||
    bytes.byteLength > limits.compressedBytes
  )
    fail("The compressed archive exceeds its limit or is empty.");
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}
export function expandedTar(bytes, limits = archiveLimits) {
  try {
    return gunzipSync(archiveBytes(bytes, limits), {
      maxOutputLength: limits.tarBytes,
    });
  } catch (cause) {
    throw new Error(
      "The gzip archive is invalid or exceeds the expanded tar limit.",
      { cause },
    );
  }
}
/** Compare every tar byte, including headers, entry order, modes, timestamps and padding. */
export function assertSameExpandedTar(left, right, limits = archiveLimits) {
  const a = expandedTar(left, limits),
    b = expandedTar(right, limits);
  if (!a.equals(b))
    fail("The expanded tar archives differ; canonical replacement is refused.");
  return {
    tarBytes: a.byteLength,
    tarSha256: hash("sha256", a).toString("hex"),
  };
}
export function registryTarballURL(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail("The npm tarball URL is invalid.");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "registry.npmjs.org" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    fail(
      "The tarball must use an uncredentialed HTTPS registry.npmjs.org URL.",
    );
  return url.href;
}
export function verifyNpmArchive(
  metadata,
  bytes,
  { name, version },
  limits = archiveLimits,
) {
  if (!metadata || metadata.name !== name || metadata.version !== version)
    fail("The registry package identity does not match the requested release.");
  const dist = metadata.dist;
  if (
    !dist ||
    !/^([a-f0-9]{40})$/u.test(dist.shasum) ||
    typeof dist.integrity !== "string" ||
    !dist.integrity.trim()
  )
    fail("The npm metadata must include SHA-1 and SRI integrity.");
  registryTarballURL(dist.tarball);
  const archive = archiveBytes(bytes, limits);
  if (hash("sha1", archive).toString("hex") !== dist.shasum)
    fail("The registry archive SHA-1 does not match its metadata.");
  for (const token of dist.integrity.trim().split(/\s+/u)) {
    const match = /^(sha256|sha384|sha512)-([A-Za-z0-9+/]+={0,2})$/u.exec(
      token,
    );
    if (!match) fail("Unsupported or malformed SRI metadata.");
    const actual = hash(match[1], archive),
      expected = Buffer.from(match[2], "base64");
    if (
      expected.toString("base64") !== match[2] ||
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    )
      fail("The registry archive SRI does not match its metadata.");
  }
  return archive;
}
async function responseBytes(response, limit) {
  if (Number(response.headers.get("content-length")) > limit)
    fail("The registry response exceeds its size limit.");
  const reader = response.body?.getReader();
  if (!reader) fail("The registry response has no body.");
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) fail("The registry response exceeds its size limit.");
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
  return Buffer.concat(chunks, total);
}
export async function fetchNpmMetadata(
  name,
  version,
  { fetcher = fetch, limits = archiveLimits } = {},
) {
  if (
    !/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/u.test(name) ||
    !/^[0-9A-Za-z.+-]+$/u.test(version)
  )
    fail("Invalid npm package identity.");
  const response = await fetcher(
    `https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(version)}`,
    { redirect: "error", signal: AbortSignal.timeout(30000) },
  );
  if (response.status === 404) return null;
  if (!response.ok)
    fail(`The npm metadata request failed (${response.status}).`);
  return JSON.parse(
    (await responseBytes(response, limits.metadataBytes)).toString("utf8"),
  );
}
export async function fetchNpmArchive(
  url,
  { fetcher = fetch, limits = archiveLimits } = {},
) {
  const response = await fetcher(registryTarballURL(url), {
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    fail(`The npm archive request failed (${response.status}).`);
  return responseBytes(response, limits.compressedBytes);
}
export async function selectCanonicalArchive({
  candidate,
  metadata,
  name,
  version,
  fetchArchive = fetchNpmArchive,
  limits = archiveLimits,
}) {
  const local = archiveBytes(candidate, limits);
  expandedTar(local, limits);
  if (metadata === null) return { archive: local, published: false };
  if (!metadata || metadata.name !== name || metadata.version !== version)
    fail("The registry package identity does not match the requested release.");
  const url = registryTarballURL(metadata.dist?.tarball);
  const published = verifyNpmArchive(
    metadata,
    await fetchArchive(url, { limits }),
    { name, version },
    limits,
  );
  const comparison = assertSameExpandedTar(local, published, limits);
  return { archive: published, published: true, ...comparison };
}
const allowedRecoveryPath = (file) =>
  /^(?:\.github\/workflows\/|scripts\/|tests?\/)/u.test(file);
/** Dispatch may repair release tooling, never the package's published source or metadata. */
export async function verifyReleaseSource({
  cwd = process.cwd(),
  tag,
  dispatch = false,
}) {
  const metadata = JSON.parse(
    await readFile(path.join(cwd, "package.json"), "utf8"),
  );
  if (tag !== `v${metadata.version}`)
    fail("The release tag must equal v<package.version>.");
  const git = (...args) =>
    execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  const tagCommit = git("rev-parse", "--verify", `refs/tags/${tag}^{commit}`),
    head = git("rev-parse", "HEAD");
  if (git("status", "--porcelain", "--untracked-files=all"))
    fail("The release checkout must be clean.");
  if (!dispatch && tagCommit !== head)
    fail("A tag release must run at the tagged commit.");
  const changed = git("diff", "--name-only", "-z", tagCommit, head)
    .split("\0")
    .filter(Boolean);
  if (dispatch) {
    if (
      !Array.isArray(metadata.files) ||
      metadata.files.some(
        (file) =>
          typeof file !== "string" ||
          /[!*?\[\]{}]/u.test(file) ||
          file.split("/").some((part) => part === ".."),
      )
    )
      fail("Recovery requires explicit literal package.files paths.");
    const publishedPaths = [
      "package.json",
      "README.md",
      "README",
      "LICENSE",
      "LICENSE.md",
      ...metadata.files,
    ].map((file) => file.replace(/\/+$/u, ""));
    for (const file of changed) {
      if (
        !allowedRecoveryPath(file) ||
        publishedPaths.some(
          (entry) => file === entry || file.startsWith(entry + "/"),
        )
      )
        fail(`Recovery changes published or non-release source: ${file}`);
    }
  }
  return { tag, tagCommit, head, dispatch, changed };
}
async function main() {
  const [command, ...args] = process.argv.slice(2);
  const value = (key) => {
    const index = args.indexOf(key);
    if (index < 0 || !args[index + 1] || args[index + 1].startsWith("--"))
      fail(`Missing ${key}.`);
    return args[index + 1];
  };
  if (command === "compare") {
    const comparison = assertSameExpandedTar(
      await readFile(value("--candidate")),
      await readFile(value("--other")),
    );
    console.log(JSON.stringify(comparison));
    return;
  }
  if (command === "verify-source") {
    console.log(
      JSON.stringify(
        await verifyReleaseSource({
          tag: value("--tag"),
          dispatch: args.includes("--dispatch"),
        }),
      ),
    );
    return;
  }
  if (command !== "canonical")
    fail("Choose canonical, compare, or verify-source.");
  const name = value("--name"),
    version = value("--version"),
    candidate = await readFile(value("--candidate"));
  const metadata = await fetchNpmMetadata(name, version);
  const result = await selectCanonicalArchive({
    candidate,
    metadata,
    name,
    version,
  });
  const output = value("--output");
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, result.archive);
  const report = {
    published: result.published,
    name,
    version,
    sha1: hash("sha1", result.archive).toString("hex"),
    sha256: hash("sha256", result.archive).toString("hex"),
    ...(result.tarBytes
      ? { tarBytes: result.tarBytes, tarSha256: result.tarSha256 }
      : {}),
  };
  await writeFile(value("--report"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
