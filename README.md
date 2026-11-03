# turbowarp-document-source

[English](README.md) | [日本語](README.ja.md)

Shared document-source and editing contracts for TurboWarp extensions and their hosts. Supports SB3 files, HTTPS URLs, YAML blocks and schema-specific blocks for configuration and other domain-specific languages (DSLs), including Kamishibai scripts.

## Role and dependencies

This package defines how document owners and hosts refer to, discover, preview, convert and commit source documents. It provides data-source hats, stable references and adapters around the single source-document registry owned by [turbowarp-document-data](https://github.com/kubohiroya/turbowarp-document-data). The Kamishibai owner labels its documents “Script data”; other owners can supply their own labels.

It supplies a shared contract, together with its document-specific implementations. Document Data and each DSL owner retain ownership of the original YAML/JSON text; [turbowarp-yaml-json](https://github.com/kubohiroya/turbowarp-yaml-json) handles syntax and comment preservation, and [turbowarp-structured-data](https://github.com/kubohiroya/turbowarp-structured-data) handles structural operations. This package connects references, hats, conversions and incremental project patches without making a second copy of the document registry.

The dashboard currently places this implementation in **Data & Documents**. Moving it alone to **Extension Contracts** would create a category dependency cycle: document-source depends on document-data and yaml-json in Data & Documents, while those packages use named-data or extension-data-editor in Extension Contracts, including development dependencies. A lower-level contract in Extension Contracts would require separating the contract from these document-specific implementations first.

## Four source modes

| Kind | Location | Representation |
| --- | --- | --- |
| `embedded-file` | Document storage inside the SB3 | YAML/JSON text |
| `url` | External HTTPS URL | YAML/JSON text |
| `yaml-blocks` | Blocks inside the SB3 | Generic YAML structure |
| `schema-blocks` | Blocks inside the SB3 | Owner-defined, DSL-specific structure |

`providerId`, `documentId` and the document filename remain stable when the representation changes. A root hat carries a version and an entry-document filename and has no previous or next connection. Ordinary document filenames must be nonempty.

`normalizeDocumentSource` separates each mode into its location and representation. `getDocumentSourceRegistry(vm)` uses Document Data's single registry rather than duplicating documents.

## HTTPS sources

Fetching or previewing a URL in the Editor leaves the project unchanged. On save, the owner validates the source against its schema/DSL before the reference URL and the validated source cache are applied as an incremental patch. At runtime startup, the host fetches and validates the URL again. A failed fetch never silently falls back to an old cache.

To edit URL content in an external editor or convert it into blocks, first switch to an embedded SB3 file and save. The host does not send PUT requests or otherwise write to the remote site. Fetches require HTTPS and UTF-8, omit credentials and reject redirects. The default limits are 1 MiB and 15 seconds. The source server must allow CORS. Relative includes resolve registered SB3 document names; they do not automatically fetch unknown documents relative to the external URL.

The shared package never reads an ambient fetch function. Pass the host's network capability explicitly to `fetchDocumentSource` and to provider registrations that enable URL operations. App Core accepts an injected URL resolver callback and rejects URL references when no resolver is provided.

## Registering an owner

The host supplies the VM, a document provider and an owner implementation that validates the source and updates its own project data:

```js
import {getDocumentSourceRegistry} from '@kubohiroya/turbowarp-document-source';

const registry = getDocumentSourceRegistry(vm);
const unregister = registry.register(provider, {
  fetch: window.fetch.bind(window), // Inject the host's network capability explicitly.
  sourceStorageId: 'myextension', // Must be a loaded owner extension ID.
  dialogTitle: {ja: '台本データ', en: 'Script data'},
  async buildSourceCandidate({project, reference, source}) {
    // Validate the source and update only this owner's caller-owned project copy.
    return {project: await owner.replaceSource(project, reference, source), source};
  }
});
```

An opened document adapter's `prepareDataSource` returns a fetched and validated candidate. `commitDataSource` uses that same candidate to apply the document and source-location changes together. It rejects intervening project changes, candidates from another session and closed dialogs. It does not zip/save or reload the entire SB3 project.

URL settings are stored in `extensionStorage[ownerExtensionId].documentSourceLocations`. They must belong to a loaded owner extension: the standard SB3 serializer omits storage for an unused shared extension ID.

## Public entry points

| Import path | Purpose |
| --- | --- |
| `@kubohiroya/turbowarp-document-source` | References, hats, markers, schema metadata, source normalization, HTTPS fetching and the shared registry adapter |
| `…/yaml-blocks` | Generic YAML block representations |
| `…/source-view` | Source-text and YAML-block conversion |
| `…/runtime` | Inert companion extension that declares YAML blocks |
| `…/project-views` | Project representation previews, conversions and incremental patches |
| `…/view-metadata` | Representation metadata |
| `…/document-views` | Document-source providers and stores |
| `…/sources` | Source types, normalization, URL storage, HTTPS fetching and the registry adapter |

Each `…/` prefix above stands for `@kubohiroya/turbowarp-document-source/`. The package also exports `package.json` and the `assets/yaml-file.svg` and `assets/yaml-block.svg` icons. JavaScript and TypeScript declarations are provided through `dist/`.

## Compatibility and rollout

Legacy embedded-yaml APIs remain available as aliases. The [compatibility package](compat/embedded-yaml/README.md) re-exports this package. Existing opcodes, document references, storage and the shared registry symbol remain unchanged.

In the Editor/App, enable the new source-location operations at startup with `twPlusDocumentSource=1`; the document UI uses the existing `twPlusYamlEditor=1` flag. Both default to OFF. To roll back, remove the new flag, restart and use the original SB3 without URL references. With the feature disabled, projects containing URL references reject fetching and do not silently use an old cache.

The GitHub repository was renamed to `turbowarp-document-source` while retaining its history and issues. The facade for the old npm name is in `compat/embedded-yaml`. Repository integration does not itself publish npm packages, tags or GitHub Releases.

For local compatibility checks, set `TW_LEGACY_EMBEDDED_YAML=/path/to/legacy-embedded-yaml`. Standalone checks do not require the legacy package and skip only that comparison when it is absent.

## Development

The implementation, tests and scripts are TypeScript. Node.js 26 (see `.nvmrc`) runs `.ts` files directly, so tests and scripts do not need a build step.

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | Type-check `src`, `scripts`, the compatibility facade and `test` |
| `npm test` | Run `node --test test/*.test.ts` |
| `npm run build` | Emit JavaScript and declarations from `src` to `dist/`, and from the facade's `src` to `compat/embedded-yaml/dist/` |
| `npm run check:dist` | Verify that rebuilt output matches the committed `dist` files |
| `npm run pack:check` | Preview the package archive without running lifecycle scripts |
| `npm run check` | Run all of the above checks, including `pack:check` |

Public `exports` point to `dist/`. The generated files are committed so Git-based consumers can use the package without building it. When changing `src`, include the result of `npm run build` in the same commit.
