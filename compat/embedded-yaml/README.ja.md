# turbowarp-embedded-yaml（互換パッケージ）

[English](README.md) | 日本語

実装は `@kubohiroya/turbowarp-document-source` へ移動しました。本パッケージはdocument-dataとyaml-jsonへ移動した実装を従来の公開exportから再exportし、文書registry・root shape・project patchのSymbol、既存SB3のopcodeを維持します。

新規利用では契約をdocument-source、registry・作品操作をdocument-data、YAML表現をyaml-jsonからimportします。依存を導入後、このディレクトリの `npm run build` が `src/` から `dist/` を生成します。旧npm名の次版を公開する際は、先に依存先の共通パッケージを公開してからこのディレクトリをpack/publishします。今回のmain統合ではnpm公開を行いません。
