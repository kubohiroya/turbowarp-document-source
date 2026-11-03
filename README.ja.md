# turbowarp-document-source

[English](README.md) | 日本語

TurboWarpの拡張とホストが共有する文書参照の契約です。安定した参照、Provider・Adapter・Registryの型、参照元の記述と宣言的な値の検証を提供します。

## 責務

文書の所有者、エディター、実行ホストが共有するプロトコルを定義します。document-dataやyaml-jsonへの実行時・開発時の依存はありません。registryの生成、SB3文書の保存、URL取得、作品ブロックの変更、YAMLの解析は実装側が担当します。

| パッケージ | 責務 |
| --- | --- |
| document-source | 参照、公開型、registryのSymbol、参照元の種類、プロトコル値の検証 |
| [document-data](https://github.com/kubohiroya/turbowarp-document-data) | registry・原文ストア、HTTPS取得と所在変更の保存、ハット・マーカー、作品への差分適用、文書provider |
| [yaml-json](https://github.com/kubohiroya/turbowarp-yaml-json) | YAMLブロック表現、原文との変換、構文・コメント保持、実行処理を持たないYAML補助runtime |

ダッシュボードではdocument-sourceを「拡張共通の契約」へ分類します。document-dataとyaml-jsonは「データ・ドキュメント」に残り、この契約に依存します。契約から実装への逆依存はありません。

## 4種類

| 種類 | 所在 | 表現 |
| --- | --- | --- |
| `embedded-file` | SB3の文書保存領域 | YAML/JSONテキスト |
| `url` | 外部HTTPS URL | YAML/JSONテキスト |
| `yaml-blocks` | SB3のブロック | 汎用YAML構造 |
| `schema-blocks` | SB3のブロック | 所有者が定義するDSL専用構造 |

`normalizeDocumentSource`は所在と表現を分け、文書名とURLを検証します。通信や保存は行いません。providerId/documentIdと文書名は形式変更時も維持します。rootはversionと入口文書名を持ち、前後の接続を持ちません。通常の文書名は空欄にできません。

## 利用方法

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

ルートから公開型、参照の符号化・復号とliteral読み取り、文書名・相対パス検証、参照元の正規化、Schemaメタデータと宣言的previewの検証を公開します。プロトコル上の値を検証するもので、Schemaの解釈やDSLの実行は行いません。`/protocol`は実装パッケージ向けの検証補助、`/package.json`はmanifestです。JavaScriptと型定義はコミット済みの`dist/`から提供します。

## 0.1からの移行

0.2では実装APIの再exportを削除します。利用する責務に応じてimport先を変更してください。

| 以前のAPI/import | 新しいimport |
| --- | --- |
| 参照・公開型・参照元正規化 | `@kubohiroya/turbowarp-document-source` |
| registryの生成・取得、getDocumentSourceRegistry、HTTPS取得、ハット・マーカー | `@kubohiroya/turbowarp-document-data/document-source` |
| document-source/project-views | `@kubohiroya/turbowarp-document-data/project-views` |
| document-source/view-metadata | `@kubohiroya/turbowarp-document-data/view-metadata` |
| document-source/document-views | `@kubohiroya/turbowarp-document-data/document-views` |
| document-source/yaml-blocks | `@kubohiroya/turbowarp-yaml-json/yaml-blocks` |
| document-source/source-view | `@kubohiroya/turbowarp-yaml-json/source-view` |
| document-source/runtime | `@kubohiroya/turbowarp-yaml-json/runtime` |
| document-source/sources | 型・正規化はdocument-source、通信・保存・registryの実装はdocument-data/document-source |
| document-source/assets/yaml-file.svg・assets/yaml-block.svg | document-data/assets/yaml-file.svg・yaml-json/assets/yaml-block.svg |

[旧npm名の互換層](compat/embedded-yaml/README.ja.md)は、実装側のエントリポイントを再exportします。その依存は契約パッケージ本体から分離します。既存の参照文字列、opcode、保存形式、registry・root shape・project patchの共有Symbolは維持します。

所有者の登録、URL/cacheの扱い、差分適用、フラグと切戻しは[実装ガイド](https://github.com/kubohiroya/turbowarp-document-data/blob/main/docs/source-integration.ja.md)へ移しました。従来の日本語原文も同ガイドに保持します。`twPlusDocumentSource`と`twPlusYamlEditor`は起動時固定・既定OFFを維持します。

公開順は契約 → yaml-json → document-data → 旧名互換層 → 利用側です。利用側はimportと依存をまとめて移行するまで直前の検証済み版を保持します。リポジトリの変更だけでnpm公開・タグ・Release作成は行いません。

## 開発

実装・テスト・スクリプトはTypeScriptです。Node.js 26（`.nvmrc`）でテストとスクリプトを直接実行します。

| コマンド | 内容 |
| --- | --- |
| `npm run typecheck` | 契約の実装・スクリプト・テストの型検査 |
| `npm test` | プロトコルと配布archiveの回帰検証 |
| `npm run build` | JavaScriptと型定義をdistへ生成 |
| `npm run check:dist` | 再ビルド結果とコミット済み出力の照合 |
| `npm run pack:check` | lifecycle scriptを実行せず配布内容を確認 |
| `npm run check` | 上記の検証を実行 |

src変更時は再生成したdistも同じコミットに含めます。旧名互換層は移動先の実装依存を導入した後に別途ビルドします。
