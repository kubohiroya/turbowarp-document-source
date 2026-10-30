# turbowarp-embedded-yaml

拡張機能ごとの組み込みYAMLを表す、非実行ハット・ファイルアイコン・Editor入口の共通ライブラリです。文書参照・provider registry・Schema metadataはDocument Dataの共通契約を再公開します。独立したScratch拡張として追加ロードしません。`0.1.0-rc.0` は試験公開版です。

YAMLの正本、構文・Schema・意味検証、関連メタデータやアセットの整合性、VMへの保存はownerの責務です。共有ライブラリはYAML本文をparse/dumpせず、ハットに本文を複製しません。GUI・特定App・外部エディタ・Node.jsへの実行依存はありません。

## 文書とprovider

`{providerId, documentId}` が永続的な参照です。`filename` は表示名で、同名の複数文書を区別するIDやOSの書込み先として使用しません。参照は `encodeReference` / `decodeReference` のみで変換してください。

```js
import {getSourceDocumentRegistry} from '@kubohiroya/turbowarp-document-data/composition';

const registry = getSourceDocumentRegistry(vm);
const unregister = registry.register({
  id: 'example-owner',
  hatOpcodes: ['example_embeddedYaml'],
  list: () => [
    {documentId: 'main', filename: 'story.yaml', format: 'yaml'},
    {documentId: 'settings', filename: 'settings.yaml', format: 'yaml'}
  ],
  open(documentId) {
    return createOwnerDocumentAdapter(vm, documentId);
  }
});
```

`getSourceDocumentRegistry(scope)` は渡されたVM等のオブジェクト上の非列挙 `Symbol.for` スロットを使用します。別bundleに同じライブラリが入っていても同一VMでは同じregistryを解決します。異なるVMのregistryは別です。共有側はVMクラスやGUIをimportしません。

- `register(provider)` は重複provider IDを拒否し、冪等な解除関数を返します。
- `list()` は `{reference, filename, format?, docsURL?, available?, reason?, schema?}` の固定コピーを返します。`provider.list()` は同期配列を返し、documentIdはprovider内で一意です。
- `open(reference)` は未知provider・未知文書・利用不能文書をcode付き例外として拒否します。encoded参照も受け付けます。
- 文書adapterは `inspect/capture/prepare/commit/dispose` を提供します。snapshotは最低 `source:string` と任意の `sourceName:string`、preparedは最低 `source:string` を持ちます。他のbaselineはownerだけが扱います。
- `getHatOpcodes()` は登録providerが宣言した既知opcodeだけを返します。未知のブロックや画面全体を文字列検索して横取りしません。
- `subscribe(listener)` はregistry・任意の `provider.subscribe` の変更を通知し、解除関数を返します。
- provider解除・registry破棄は開いたadapter、provider subscription、任意の `provider.dispose()` を解放します。終了後のprepare/commitは拒否します。ownerもdisposeを冪等にしてください。

作品変更時のgeneration、source/component revision、保存直前の競合確認、Undo/Redo、VMへのatomic commitはownerが実装します。共有registryは正本の別コピーを保存しません。

旧`getProviderRegistry`・`encodeReference`・`decodeReference`・Schema関連の名前は、Document Dataの同一関数への互換aliasです。独自のregistry/ref/schema実装は保持しません。既存v1のSymbolとencoded参照は変更せず、互換facadeとDocument Dataは同一VMの文書を同じregistryで解決します。format metadataに未対応の旧実装が既にregistryを作っている場合は、JSON文書をYAMLとして渡すことを避けるため`REGISTRY_INCOMPATIBLE`で拒否します。その場合はowner/runtimeを新しい共通契約へ更新して作品を開き直してください。新しいownerはDocument Dataの`./composition`を直接利用してください。

Document Dataの原文providerがYAML/JSONの原文とSB3保存先を所有します。structured-dataによる値への投影やyaml-json codecによるparseは原文を自動書き換えません。本packageのYAMLハットは文書の入口だけです。

## ハットとSB3

```js
import {
  createEmbeddedYamlHatDefinition, createEmbeddedYamlDocumentMenu,
  installEmbeddedYamlMarker
} from '@kubohiroya/turbowarp-embedded-yaml';

const reference = {providerId: 'example-owner', documentId: 'main'};
const block = createEmbeddedYamlHatDefinition({BlockType, defaultReference: reference});
const menus = {embeddedYamlDocuments: createEmbeddedYamlDocumentMenu(registry.list())};
// getInfo() の blocks と menus に組み込み、ownerのembeddedYaml primitiveはfalseを返します。
installEmbeddedYamlMarker(projectCopy, {opcode: 'example_embeddedYaml', reference});
```

ハットは `embedded YAML [DOCUMENT]`、専用YAMLファイルSVG、`isEdgeActivated:false` です。DOCUMENTは `acceptReporters:false` dropdownで、表示値はfilename、内部値はencoded参照です。本文・dummy SOURCE引数はありません。メニューに文書がない場合は無効な空値の `—` のみを表示します。

現TurboWarp VMでは非reporterメニューは直接fieldになります。生成SB3は `fields.DOCUMENT: [encodedReference, null]`、`inputs:{}` を使います。`readReference(block,target)` はBlockSvg、VM block、serialized direct field、互換用literal shadowを読みます。reporterは評価せず拒否します。

marker helperは呼出側のproject copyのStageだけを編集します。1文書ごとにmarkerを置き、同じopcode・参照には重複追加しません。ownerが対象文書の実在性を検証してから呼び出してください。source/menu/compiled等の判定やstorageの移行は行いません。`removeEmbeddedYamlMarkers(project,{opcodes})` は指定markerだけを除去し、接続されたユーザー命令は独立stackとして保持します。

## 文書の説明・検証・編集

文書metadataの`format`は`yaml`または`json`を明示します。`docsURL`にはownerの固定HTTPS解説ページを指定できます。Editorのアイコンは説明・検証・編集を選ぶダイアログを開き、VSCode起動は明示的な編集ボタンで行います。検証はownerの`prepare`だけを呼び、`commit`・VM停止・ファイル書込みは行いません。ownerは`prepare`で構文・Schema・意味を検査し、失敗時に理由を返す責務を持ちます。

## 任意のJSON Schema

provider metadataに `schema: {id, schema}` を指定できます。ownerの固定配布に含まれるself-containedなJSON Schema objectを渡してください。JSON Schemaの解釈・draftの対応・`$ref` 解決・最終検証はownerや編集支援側の責務です。共有側はSchemaを取得・解釈しません。

`normalizeSchemaMetadata` はregistry経由と独立HTTP境界の両方で使用できます。plain object/配列と有限JSON値だけを許可し、accessor・隠しproperty・循環・非JSON値を拒否してimmutable copyを返します。最大UTF-8 1MiB、深さ64、100000 valuesです。URIやfilenameをOSパスや実行コマンドとして使用しないでください。

## 検証と切戻し

`npm test`。公開操作をせず `npm pack --ignore-scripts` でローカルtarballを作成できます。統合先は既定OFFのフラグを維持し、切戻しはそのフラグOFFまたは依存と接続差分のrevertです。元の組み込みsourceの保存形式は変更しません。

作業記録: [文書契約統合 #9](https://github.com/kubohiroya/turbowarp-plus-editor/issues/9)、[PlusEditor #6](https://github.com/kubohiroya/turbowarp-plus-editor/issues/6)、[Schema支援 #7](https://github.com/kubohiroya/turbowarp-plus-editor/issues/7)、[App #1097](https://github.com/kubohiroya/turbowarp-kamishibai-app/issues/1097)。新規remoteやnpm公開は行っていません。

MPL-2.0。Copyright Hiroya Kubo。

## 共通YAMLブロック表現

`./yaml-blocks` は `createYamlBlockDefinitions` / `createYamlBlockMenus` / `createYamlBlockOpcodes` と、`createYamlBlockView` / `readYamlBlockView` を提供します。map、文字列key、list、item、型付きscalar、before/inline/afterのcommentを実ブロックとして表します。ブロックは実行時にYAMLを評価しません。未知opcode・reporter・不正な接続・循環・型不一致は変換時に拒否します。

`./runtime` の `createYamlBlockRuntime(Scratch,{enabled:true})` は独立した `kubohiroyaembeddedyaml` 拡張のfactoryです。既定OFFで、起動時に固定した `TW_EMBEDDED_DOCUMENT_VIEWS=true` または明示optionが必要です。DocDataからこのruntimeをimportしません。App等のownerは同じblock definitionsを自分のruntimeへ組み込むこともできます。

`./source-view` は `yaml-json/source-syntax` のCST codecへ接続します。独自のYAML serializerは持ちません。無変更の原文はそのまま返し、コメント・値の型を扱えない形式は原文を変更せず拒否します。安全に扱える範囲はsource-syntax codecの契約に従います。

view descriptor v2にはdocument reference、known root opcode、syntaxの構造path→IDだけを保存し、Scratch block IDを永続参照しません。通常のSB3保存によるblock ID最適化の後も、参照とopcodeからrootを再発見します。`createYamlBlockView` が返す `rootId/nodeIds/keyIds` はその場での編集用で、永続metadataへ保存しません。opaque syntax baselineは正本の原文から再parseします。

`./view-metadata` の `readDocumentViewMetadata` / `writeDocumentViewMetadata` は、callerが渡したowner storageの `editorViews={version:1,views:{encodedReference:{activeKind,descriptors}}}` を扱います。原文はここへ複製しません。VMは未使用extensionのstorageを保存しないため、独立した共通namespaceへ置かず実際のsource ownerの保存対象へ入れてください。ownerはsourceのrevision/integrityも比較し、外部編集で変わった原文へ古いblock viewを上書きしない責務を持ちます。

表現変換はownerの `prepareRepresentation(snapshot,{kind,direction})` で候補を作り、表示したsummaryを確認してから `commitRepresentation` で明示適用します。Editor自身がDSL変換を実装することはありません。native編集が残っている場合は終了を確認し、未取り込みのファイルを保持します。

### コメント行と複数行文字列

コメントは1行1node／1ブロックです。複数行文字列は`yamlText`の中の`yamlTextLine [TEXT] [BREAK]`へ分け、BREAK（LF／CRLF／CR／none）を型付きの文字列へ結合します。空行と末尾改行も保持します。単行inputにCR/LFを入れないため、入力欄を開いて無変更確定しても改行を失いません。multiline keyは安全subset外として原文を変更せず拒否します。

## 開始文書rootとファイル名（ローカル追加）

`createEmbeddedYamlRootHatDefinition(options)` は版を `VERSION`、開始文書を `DOCUMENT` で指定する独立した参照ハットです。`defaultVersion` は必須の文字列で、generic側は版の意味を解釈しません。`createEmbeddedYamlRootVersionMenu(["4.0"])` を `getInfo().menus.embeddedYamlVersions` へ登録します。`VERSION` はreporterを受け取らない静的dropdownで、root markerと同じ直接field表現です。別menu名には `versionMenuName` を指定します。root marker作成には `version` を指定し、`readEmbeddedYamlRootVersion` で読めます。ownerが対応版を検証します。本文を持たず、通常の `embedded YAML` 文書ハットが本文ブロックを持ちます。通常ハットの接続は変更しません。新規の設定専用ハットを作るためのAPIではありません。

呼出側はブロックを初めて生成する前に `registerEmbeddedYamlRootHatShape(Blockly)` を実行します。これはScratchBlocksの標準 `Extensions.register` を使い、rootだけの上下接続を無効にします。固定VMはHATの `isTerminal` を参照せず下接続を付けるため、`isTerminal:true` だけでは独立化できません。VMが転送するJSON `extensions` で接続を除去します。登録前にrootを初期化しないでください。非実行ハットをクリックして物語を自動実行する機能は追加しません。

`createEmbeddedYamlRootMarker` / `installEmbeddedYamlRootMarker` は参照のみのStage上のrootを作ります。`validateEmbeddedYamlRootMarker` は上・下・本文接続、shadow、複数rootや別entryへの暗黙変更を許しません。ownerは参照文書の実在性・entryPathとの一致も確認してください。通常文書の既存本文をrootへ移したり、自動で捨てたりする処理はありません。

通常文書には空でないファイル名が必要です。`validateEmbeddedYamlFilename(name)` はbasename、`validateEmbeddedYamlRelativePath(path)` は正規化済みの相対POSIXパスを検証し、元の文字列をそのまま返します。日本語を使えます。空欄、制御文字、OS禁止文字、Windows予約名、末尾の空白・ピリオド、パス区切りの混入、相対パスの `.` / `..` / 空segmentを拒否します。1segmentはUTF-8で255bytes、全体パスは1000文字以内です。拡張子の追加、空欄の仮名補完、trim、Unicode正規化、名前の自動変更をしません。ファイル名の重複・Unicodeや大文字小文字の衝突、DSL固有suffix、保存済みentryとの整合はownerが検証します。

### 行コメントと行末コメント

新しく生成する共通YAML表現は、独立した物理行のコメントを **YAML line comment**（行コメント）ブロックで示します。`PLACEMENT` は `before` / `after` のみです。値に続くコメントは **YAML inline comment**（行末コメント）で示し、位置選択欄を持ちません。どちらも `TEXT` はコメント記号の後の文字列を扱い、日本語、先頭空白、本文内の追加の `#` を削りません。`#` 記号そのものと改行は共通の原文codecが出力します。1ブロックは1物理行で、入力欄へのCR/LFは拒否します。

同じ文のコメントが複数あっても個別の構文IDを維持します。無変更の原文はBOM・CRLF・引用符を含めてそのまま保持し、コメントを編集する場合も原文codecを通します。codecの空コメント表現は変更しません。コメントを付箋へ移す処理や、対応先が曖昧なコメントの自動配置は追加しません。

旧 `yamlComment [PLACEMENT] [TEXT]` はパレットでは非表示にし、保存済み作品の `before` / `inline` / `after` の読戻しを維持します。既存の8種類だけの独自opcode mapも互換読み書きに対応し、新しい `createYamlBlockOpcodes()` には `lineComment` / `inlineComment` が加わります。ownerがpalette非表示をまとめて制御する場合も、定義側の `hideFromPalette` を保持してください。

### 作品全体を再読込しない表現更新

`./project-views` の表現確定は、`project-patch` のprepare／同期applyへ接続します。SB3の圧縮・保存・解凍・`loadProject`、`stopAll`、全workspaceの再描画を呼びません。対象のブロック・標準コメントと、変更された文書metadataだけを更新します。既存ハットはIDとVMオブジェクトを保ち、無関係なブロック・変数・衣装・音・アセットや非列挙aliasを変更しません。実行rootの順序も維持します。

不足する拡張は、確定前にVMの標準セキュリティ承認を通して読み込み、承認待ち中に作品が変わった場合は差分を適用しません。元の衣装・音・変数・monitors等を変更する候補、アセットを変更する候補、壊れた接続は拒否します。読み出し専用のsource descriptorがある場合は、そのmetadataの最も近い書換え可能な祖先だけをcopy-on-writeで更新します。

GUIホストは `installProjectPatchWorkspaceAdapter(vm,{prepare({targetChanges}) { return {apply(){...},rollback(){...}}; }})` を登録します。`targetChanges` はtarget IDと変更対象root／block／comment IDだけを渡します。prepare・apply・rollbackは同期です。ホストは該当rootの表示だけを更新し、スクロールや無関係なブロックの表示を保ってください。ヘッドレスVMでは登録不要です。登録解除関数をdispose時に呼びます。

途中のブロック変更通知を抑え、VM差分とGUI差分の適用後に変更通知を1回送ります。適用に失敗した場合は元のブロック・コメント・metadataとGUIを同期復元し、復元が完了したかをエラーに明示します。復元後に削除済みblockの辞書挿入順だけが変わる可能性があるため、再試行には新しいsnapshotを取得します。正常適用後の外部observer例外は、確定済みの変更を失敗扱いにしません。

## 試験公開版の利用

```sh
npm install --save-exact @kubohiroya/turbowarp-embedded-yaml@0.1.0-rc.0
```

文書操作はホスト側の起動時フラグで明示的に有効化します。既存作品・原文は保持し、切戻し時はフラグを外して直前の検証済み版へ戻します。
