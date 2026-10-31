# turbowarp-document-source

TurboWarpの「データソース」ハットと文書編集契約の共通パッケージです。紙芝居に限らず、設定や他のDSLの文書を扱います。紙芝居側では「台本データ」と表示します。

## 4種類

| 種類 | 所在 | 表現 |
| --- | --- | --- |
| embedded-file | SB3の文書保存領域 | YAML/JSONテキスト |
| url | 外部HTTPS URL | YAML/JSONテキスト |
| yaml-blocks | SB3のブロック | 汎用YAML構造 |
| schema-blocks | SB3のブロック | 所有者が定義するDSL専用構造 |

providerId/documentIdおよび文書名は形式を変更しても維持します。rootはversionと入口文書名を持ち、前後の接続を持ちません。通常の文書名は空欄にできません。

`normalizeDocumentSource`は4種類をlocation/representationへ分解します。`getDocumentSourceRegistry(vm)`はDocument Dataの単一registryを利用し、文書を複製しません。YAML/JSONの原文はDocument Dataや各DSL所有者、構文とコメント保持はyaml-json、構造操作はstructured-dataが担当します。本パッケージは参照・ハット・変換と差分適用を接続します。

## URLの扱い

EditorはURL取得/プレビューでは作品を変更せず、保存時に所有者のSchema/DSL検証後に参照URLと検証済みの原文cacheを差分反映します。実行開始時にはURLを再取得して検証します。取得失敗では古いcacheを暗黙に再生しません。

URL内容を外部エディタで編集・ブロックへ変換する場合は、先に「SB3内のファイル」へ変更して保存します。遠隔サイトへPUT等を送信しません。URLはHTTPSのみ、credentials omit、redirect error、UTF-8、既定1MiB/15秒上限です。CORSで取得できる配信元を使用してください。相対includeは登録済みSB3文書名で解決し、外部URLを基準に未知の文書を自動取得しません。

## 所有者の登録

```js
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

`prepareDataSource`は取得・検証済みの候補を返します。`commitDataSource`はその同じ候補を利用して文書と参照元を一括で差分適用します。途中の作品変更、異なるセッションの候補、閉じたダイアログは拒否します。SB3圧縮保存・全体再読込は行いません。

## 互換と導入

従来のembedded-yaml APIは旧名のaliasとして残します。互換パッケージは本パッケージへの再exportに一本化します。既存opcode、文書reference、storage、共有registry Symbolは変更しません。

Editor/Appの新しい参照元操作は起動時 `twPlusDocumentSource=1`、文書UI自体は既存の `twPlusYamlEditor=1` で有効にします。両方とも既定OFFです。切戻しは新フラグを外して再起動し、URL参照を含まない元SB3を利用します。URL参照を含む作品は機能OFF時に取得を拒否し、古いcacheへ暗黙に戻りません。

GitHubリポジトリは既存の履歴・Issueを保持して `turbowarp-document-source` へ改名しています。旧npm名の互換層は `compat/embedded-yaml` に置きます。npm公開・タグ・Releaseはこの変更に含みません。

URL設定は `extensionStorage[所有拡張ID].documentSourceLocations` に保存します。未使用の共通拡張IDの領域は標準SB3シリアライザが省略するため使用しません。

共通パッケージはambient fetchを参照しません。`fetchDocumentSource`、およびURL操作を有効にする提供元登録には、ホストが通信関数を明示的に渡します。App CoreはURLを解決するためのcallbackを受け取り、提供されないURL参照を拒否します。

ローカルの互換層検証では `TW_LEGACY_EMBEDDED_YAML=/path/to/legacy-embedded-yaml` を指定します。共通パッケージ単独の検証は互換層を必要とせず、この照合だけをスキップします。

## 開発

実装・テスト・スクリプトはTypeScriptです。Node.js 26（`.nvmrc`）は `.ts` を直接実行するため、テストとスクリプトにビルドは不要です。

| コマンド | 内容 |
| --- | --- |
| `npm run typecheck` | `src`・`scripts`・互換層と `test` を型検査します |
| `npm test` | `node --test test/*.test.ts` |
| `npm run build` | `src` から `dist/`、互換層の `src` から `compat/embedded-yaml/dist/` へJavaScriptと型定義を出力します |
| `npm run check:dist` | 再ビルドした出力がコミット済みの `dist` と一致することを確認します |
| `npm run check` | 上記すべてと `pack:check` |

公開する `exports` は `dist/` を指します。git参照で導入する利用側がビルドせずに使えるよう、`dist/` はコミットします。`src` を変更したら `npm run build` の結果も同じコミットに含めます。
