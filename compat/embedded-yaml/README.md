# turbowarp-embedded-yaml（互換パッケージ）

実装は `@kubohiroya/turbowarp-document-source` へ移動しました。本パッケージは従来の公開exportを再exportし、文書registry・root shape・project patchのSymbol、既存SB3のopcodeを維持します。

新規利用は `@kubohiroya/turbowarp-document-source` を選びます。旧npm名の次版を公開する際は、先に依存先の共通パッケージを公開してからこのディレクトリをpack/publishします。今回のmain統合ではnpm公開を行いません。
