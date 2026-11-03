# turbowarp-document-source

[English](README.md) | [日本語](README.ja.md)

Shared document-source contracts for TurboWarp extensions and their hosts: stable references, provider/adapter/registry interfaces, source descriptors and declarative value validation.

## Responsibilities

This package defines the protocol that document owners, editors and runtime hosts share. It has no runtime or development dependency on document-data or yaml-json. It does not create a document registry, persist an SB3 document, fetch a URL, mutate project blocks or parse YAML.

The implementation packages depend on this contract:

| Package | Responsibility |
| --- | --- |
| document-source | References, protocol types, registry symbol, source kinds and validation of protocol values |
| [document-data](https://github.com/kubohiroya/turbowarp-document-data) | Registry/store implementations, HTTPS retrieval and source-location commits, hats/markers, project patches and document providers |
| [yaml-json](https://github.com/kubohiroya/turbowarp-yaml-json) | YAML block representations, source/block conversion, syntax/comment preservation and the inert YAML companion runtime |

The dashboard places document-source in **Extension Contracts**. Document-data and yaml-json remain in **Data & Documents**; both depend on this contract, with no dependency back from the contract.

## Source modes

| Kind | Location | Representation |
| --- | --- | --- |
| `embedded-file` | SB3 document storage | YAML/JSON text |
| `url` | HTTPS URL | YAML/JSON text |
| `yaml-blocks` | SB3 blocks | Generic YAML structure |
| `schema-blocks` | SB3 blocks | Owner-defined DSL structure |

`normalizeDocumentSource` separates location from representation and validates the filename and URL. It does not fetch or persist anything. `providerId`, `documentId` and filenames remain stable across representation changes. Root hats carry a version and an entry-document filename with no previous/next connection; ordinary document filenames are nonempty.

## Using the contract

```ts
import {
  encodeSourceDocumentReference,
  normalizeDocumentSource,
  type SourceDocumentProvider
} from '@kubohiroya/turbowarp-document-source';

const reference = {providerId: 'myextension', documentId: 'main'};
const wire = encodeSourceDocumentReference(reference);
const descriptor = normalizeDocumentSource({
  kind: 'embedded-file',
  filename: 'main.yaml'
});

// The owner implements the protocol; a host supplies its concrete adapter.
export function providerFor(adapter: ReturnType<SourceDocumentProvider['open']>): SourceDocumentProvider {
  return {
    id: reference.providerId,
    list: () => [{documentId: reference.documentId, filename: descriptor.filename}],
    open: () => adapter
  };
}
```

The root entry exports TypeScript protocol types, reference encoding/decoding, literal reference reading, portable filename/path checks, source descriptor normalization, schema-metadata validation and declarative preview validation. These checks validate protocol values without interpreting schemas or executing a DSL. `/protocol` exposes validation helpers for implementation packages; `/package.json` exposes the manifest. Public JavaScript and declarations are committed under `dist/`.

## Migrating from 0.1

The 0.2 API deliberately removes implementation re-exports. Update each import according to its responsibility:

| Previous import/API | New import |
| --- | --- |
| document-source: reference helpers, protocol types, source normalization | `@kubohiroya/turbowarp-document-source` |
| document-source: registry factories, `getDocumentSourceRegistry`, HTTPS fetching, hats/markers | `@kubohiroya/turbowarp-document-data/document-source` |
| document-source/project-views | `@kubohiroya/turbowarp-document-data/project-views` |
| document-source/view-metadata | `@kubohiroya/turbowarp-document-data/view-metadata` |
| document-source/document-views | `@kubohiroya/turbowarp-document-data/document-views` |
| document-source/yaml-blocks | `@kubohiroya/turbowarp-yaml-json/yaml-blocks` |
| document-source/source-view | `@kubohiroya/turbowarp-yaml-json/source-view` |
| document-source/runtime | `@kubohiroya/turbowarp-yaml-json/runtime` |
| document-source/sources | Contract types/normalizers from document-source; fetching/storage/registry implementations from document-data/document-source |
| document-source/assets/yaml-file.svg, assets/yaml-block.svg | document-data/assets/yaml-file.svg, yaml-json/assets/yaml-block.svg |

The [legacy npm facade](compat/embedded-yaml/README.md) re-exports the implementation entry points for existing embedded-yaml consumers. Its dependencies are separate from this contract package's dependencies. Existing reference strings, opcodes, storage formats and shared registry/root-shape/project-patch symbols remain unchanged.

For owner registration, URL behavior, source caches, project patches, flags and rollback, see [the implementation guide](https://github.com/kubohiroya/turbowarp-document-data/blob/main/docs/source-integration.md). Original Japanese documentation is retained in its [Japanese counterpart](https://github.com/kubohiroya/turbowarp-document-data/blob/main/docs/source-integration.ja.md). The host flags `twPlusDocumentSource` and `twPlusYamlEditor` remain startup-fixed and OFF by default.

Publish compatible releases in dependency order: contract → yaml-json → document-data → legacy facade → consumers. Keep existing consumers on their previously verified versions until their imports and dependencies are migrated together. No npm package, tag or Release is published merely by changing these repository files.

## Development

Implementation, tests and scripts use TypeScript. Node.js 26 (`.nvmrc`) runs tests/scripts directly.

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | Check contract sources, scripts and tests |
| `npm test` | Protocol and canonical-archive regression tests |
| `npm run build` | Generate JavaScript and declarations under `dist/` |
| `npm run check:dist` | Compare rebuilt output with committed output |
| `npm run pack:check` | Inspect the package archive without lifecycle scripts |
| `npm run check` | Run all checks |

Commit regenerated `dist/` alongside source changes so Git consumers can use the contract without building it. The legacy facade is built separately after installing its implementation dependencies.
