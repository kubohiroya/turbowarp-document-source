# turbowarp-embedded-yaml (compatibility package)

[English](README.md) | [日本語](README.ja.md)

The implementation has moved to [`@kubohiroya/turbowarp-document-source`](../../README.md). This facade re-exports implementations from document-data and yaml-json through the existing public entry points and preserves the document registry, root-shape and project-patch symbols, as well as opcodes in existing SB3 projects.

Use the contract package for protocol types and reference helpers, document-data for registry/project operations and yaml-json for YAML views. After installing this facade's dependencies, run `npm run build` in this directory to generate `dist/` from `src/`. Before publishing a new version under the old npm name, publish the canonical dependency first, then pack/publish this directory. Repository integration does not itself publish the npm package.
