# turbowarp-embedded-yaml (compatibility package)

[English](README.md) | [日本語](README.ja.md)

The implementation has moved to [`@kubohiroya/turbowarp-document-source`](../../README.md). This facade re-exports the existing public entry points and preserves the document registry, root-shape and project-patch symbols, as well as opcodes in existing SB3 projects.

Use `@kubohiroya/turbowarp-document-source` for new integrations. Running `npm run build` at the repository root generates this package's `dist/` from its `src/`. Before publishing a new version under the old npm name, publish the canonical dependency first, then pack/publish this directory. Repository integration does not itself publish the npm package.
