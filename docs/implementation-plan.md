# Stylect 残り実装プラン

**リポジトリ:** `/path/to/stylect`  
**詳細設計（Phase 1 fetch/sample）:** [phase1.md](./phase1.md)  
**参照 OSS:** [arlington-labs/gitstyle](https://github.com/arlington-labs/gitstyle)

---

## 全体ロードマップ

```
Phase 0  ████████░░  スキャフォールド（CLI 骨格・モデル・sample 大半）
Phase 1  ████░░░░░░  fetch + sample 完走（MVP）
Phase 1.1 ░░░░░░░░░░  サブコマンド・複数 author
Phase 2  ░░░░░░░░░░  extract + compile + lint（Cursor SDK）
Phase 3  ░░░░░░░░░░  write（.cursor/rules / wiki / Orbit）
Phase 4  ░░░░░░░░░░  増分 LLM・npm 公開・polish
```

**パイプライン全体:**

```
fetch → sample → extract → compile → lint → write
  ↑       ↑        ↑ LLM      ↑ LLM    ↑ LLM
Phase 1  Phase 1   Phase 2    Phase 2  Phase 2–3
```

---

## 現状（2026-07-09）

### 完了済み

| 領域 | ファイル | 状態 |
|------|----------|------|
| モデル | `src/models/commit.ts`, `cluster.ts`, `serialize.ts` | snake_case シリアライズ対応 |
| sample | `src/sample/select.ts`, `index.ts` | gitstyle 移植済み |
| キャッシュ | `src/fetch/cache.ts` | JSONL / samples / meta |
| 言語推定 | `src/util/language.ts` | 拡張子マップ |
| repo 解決 | `src/util/repo-path.ts` | slug / perRepoLimit / resolveRepoPath |
| GitHub languages | `src/fetch/languages.ts` | REST（token 要） |
| 設定型 | `src/config.ts` | `plan`, `repoPaths`, `source` 追加済み |
| CLI 骨格 | `src/cli.ts`, `parse-args.ts` | 未接続・型エラーあり |
| パイプライン | `src/pipeline/run.ts` | プラン表示のみ（スタブ） |
| テスト | `src/parse-args.test.ts` | 3 件（要更新） |

### 未実装・要修正

| 領域 | 不足 | ブロッカー |
|------|------|-----------|
| `parse-args.ts` | `defaultConfig()` 未使用、`--plan` / `--repo-path` / `--source` なし | typecheck 失敗 |
| `cli.ts` | token 常時必須、help が旧 `--dry-run` | local-git MVP 不可 |
| `fetch/local-git.ts` | なし | Phase 1 核心 |
| `fetch/index.ts` | auto 戦略なし | pipeline 接続不可 |
| `fetch/github.ts` | なし | クロスマシン用（後回し可） |
| `pipeline/run.ts` | fetch/sample 未呼び出し | `run` が動かない |
| テスト | sample / serialize / cache / local-git なし | CI カバレッジ不足 |
| Phase 2+ | すべて | — |

**現時点の typecheck:** `parse-args.ts` が `StylectConfig` の新フィールドを埋めていないため失敗。

---

## Phase 1 残り（MVP）

**ゴール:** `stylect run -r ... -a ... --repo-path ...` で `~/.stylect/<slug>/` にキャッシュができる。

詳細仕様は [phase1.md](./phase1.md) を参照。ここでは **残タスクと PR 単位**のみ記載。

### PR-1a: CLI / config 整合（小）

**目的:** typecheck 復旧、Phase 1 CLI フラグ追加。

| タスク | ファイル |
|--------|----------|
| `parseArgv` を `defaultConfig()` ベースに変更 | `parse-args.ts` |
| `--plan`, `--repo-path`, `--source` パース | `parse-args.ts` |
| `--dry-run` → `plan: true` の alias | `parse-args.ts` |
| `run` 時 `--author` 必須（`plan` 時は任意可） | `parse-args.ts`, `pipeline/run.ts` |
| help / token 条件分岐更新 | `cli.ts` |
| `planPipeline` を `config.plan` ベースに | `pipeline/run.ts` |
| テスト更新 | `parse-args.test.ts` |

**token 必須条件（repo 単位判定）:**

```ts
const needsGitHubForRepo = (repo: string) =>
  !config.plan &&
  (config.source === 'github' ||
    (config.source === 'auto' && resolveRepoPath(config, repo) === undefined))

const needsGitHub = config.repos.some((repo) => needsGitHubForRepo(repo))
```

### PR-1b: local-git fetch

**目的:** ローカル clone からコミット + patch 取得。

| タスク | ファイル |
|--------|----------|
| `git log --no-merges --author ...` で SHA 一覧 | `fetch/local-git.ts` |
| コミットあたり `git show -p` 1 回、diff パース | `fetch/local-git.ts` |
| 秘密パス除外（`.env`, `*credentials*`, `*.pem`） | `fetch/local-git.ts` |
| patch 100KB truncate | `fetch/local-git.ts` |
| repo languages 付与（token あれば API、なければ extensions） | `fetch/local-git.ts` + `languages.ts` |
| 増分 fetch（`commits.jsonl` + `latestAuthoredAt`） | `fetch/index.ts` or `local-git.ts` |
| `meta.json` 書き込み | `fetch/index.ts` |
| temp git repo テスト | `src/fetch/__tests__/local-git.test.ts` |

**増分ロジック:**

1. `commits.jsonl` あり & `!fresh` → `since = latestAuthoredAt`
2. 新規 SHA のみ `mergeCommits`
3. `newCommits.length > 0` → sample 再計算（既存 `shouldUseSampleCache`）

### PR-1c: pipeline 統合

**目的:** `stylect run` が fetch → sample で止まる。

| タスク | ファイル |
|--------|----------|
| `fetch(repo, config)` — local のみ（MVP） | `fetch/index.ts` |
| `runPipeline` ループ（multi-repo + `perRepoLimit`） | `pipeline/run.ts` |
| stdout サマリ | `pipeline/run.ts` |
| `--fresh` で repo キャッシュディレクトリ削除 | `pipeline/run.ts` |
| README 更新（`--plan`, `--repo-path`, 手動検証） | `README.md` |

### PR-1d: テスト補完

| テスト | 内容 |
|--------|------|
| `src/sample/__tests__/select.test.ts` | 件数・重複なし・seed 42 再現 |
| `src/models/__tests__/serialize.test.ts` | snake_case round-trip |
| `src/fetch/__tests__/cache.test.ts` | mergeCommits, latestAuthoredAt |
| `src/util/__tests__/language.test.ts` | `.rb` → Ruby |

### Phase 1 完了チェックリスト

- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` 成功
- [ ] com リポ手動検証（[phase1.md#手動検証](./phase1.md#手動検証コマンドcom-リポ)）
- [ ] 2 回目実行で増分 + sample 再計算
- [ ] `--plan` はファイル書き込みなし

### Phase 1 見積もり（残り）

| PR | LOC 目安 |
|----|----------|
| PR-1a CLI | ~120 |
| PR-1b local-git | ~280 |
| PR-1c pipeline | ~100 |
| PR-1d tests | ~200 |
| **合計** | **~700** |

---

## PR-1e: GitHub fetch（オプション・Phase 1 拡張）

clone が無い環境向け。MVP 後でも可。

| タスク | ファイル |
|--------|----------|
| `@octokit/rest` 追加 | `package.json` |
| `list_commits` → `get_commit` per SHA | `fetch/github.ts` |
| author フィルタ常時有効 | `fetch/github.ts` |
| レート制限待機 | `fetch/github.ts` |
| `fetch/index.ts` の `auto` に組み込み | `fetch/index.ts` |

---

## Phase 1.1（polish）

| 機能 | 内容 |
|------|------|
| `stylect fetch` / `stylect sample` | gitstyle の `fetch-cmd` / `sample-cmd` 相当。デバッグ用 |
| 複数 `--author` | `git log` に複数回 or regex |
| `stylect clean --cache` | repo キャッシュ削除 |
| 並列 `git show` | コミット数が多い場合のオプション（`--parallel 4`） |

---

## Phase 2: extract + compile + lint

**ゴール:** `CURSOR_API_KEY` ありの `stylect run` で観察 JSON と wiki 記事ドラフトをキャッシュに保存。

**LLM:** `@cursor/sdk`（Anthropic 直叩きは使わない）。  
**参照:** gitstyle `extract.py`, `compile.py`, `lint.py`

### 依存追加

```bash
pnpm add @cursor/sdk
```

`@cursor/sdk` のバージョンは固定値をドキュメントに埋めず、追加時点の最新版を採用する。  
環境変数: `CURSOR_API_KEY`（Dashboard → API Keys）

### ディレクトリ構成（追加）

```
src/
├── extract/
│   ├── index.ts
│   ├── dimensions.ts    # 9 StyleDimension
│   ├── prompt.ts          # EXTRACT_SYSTEM 移植
│   └── build-prompt.ts
├── compile/
│   ├── index.ts
│   ├── prompt.ts          # COMPILE_SYSTEM, LANGUAGE_COMPILE_SYSTEM
│   └── merge.ts           # 次元ごとに observations 集約
├── lint/
│   ├── index.ts
│   └── prompt.ts
├── llm/
│   ├── cursor.ts          # Agent.prompt + JSON 抽出 + リトライ
│   └── parse-json.ts      # markdown fence 除去
└── models/
    ├── observation.ts
    ├── extraction.ts
    ├── article.ts
    └── lint-report.ts
```

### キャッシュ（repo slug 配下に追加）

```
~/.stylect/<slug>/
├── commits.jsonl      # Phase 1
├── samples.json       # Phase 1
├── meta.json
├── extractions.json   # ClusterExtraction[]
├── articles.json      # WikiArticle[]
└── lint.json          # LintReport
```

### 9 次元（gitstyle 互換）

| slug | 説明 |
|------|------|
| `code-structure` | ファイル構成・モジュール境界 |
| `naming-conventions` | 命名 |
| `patterns` | デザインパターン |
| `type-discipline` | 型 |
| `testing` | テスト |
| `comments-and-docs` | コメント・ドキュメント |
| `dependencies` | 依存関係 |
| `commit-hygiene` | コミットメッセージ |
| `language-idioms` | 言語固有イディオム |

### PR-2a: LLM 基盤

| タスク | 内容 |
|--------|------|
| `llm/cursor.ts` | `completeJson(system, user)` |
| JSON パース + 3 回リトライ | `llm/parse-json.ts` |
| モデル選択 | default `composer-2.5`（`--model` で上書き可） |
| キャッシュ serializer | `models/serialize-llm.ts`（`extractions/articles/lint` を snake_case で read/write） |
| dry-run / plan 時は LLM スキップ | 各 stage |

### PR-2b: extract

| タスク | 内容 |
|--------|------|
| クラスタごとに LLM 1 回 | `extract/index.ts` |
| プロンプト: コミット message + patch サマリ | `build-prompt.ts` |
| `extractions.json` キャッシュ | snake_case |
| テスト: プロンプト組み立て（LLM モック） | fixture |

### PR-2c: compile

| タスク | 内容 |
|--------|------|
| 次元ごとに observations マージ | `compile/merge.ts` |
| 言語別記事 + 次元別記事 | gitstyle `compile.py` 踏襲 |
| `articles.json` 出力 | |
| Obsidian wikilink 形式（本文内） | Phase 3 write で利用 |

### PR-2d: lint

| タスク | 内容 |
|--------|------|
| 全記事を LLM に渡し矛盾・弱い根拠を検出 | `lint/index.ts` |
| `LintReport`（passed, issues[]） | |
| `lint.json` キャッシュ | |

### Phase 2 完了チェックリスト

- [ ] `CURSOR_API_KEY` ありで extract → compile → lint 完走
- [ ] `extractions.json` / `articles.json` / `lint.json` が snake_case
- [ ] LLM 系 serializer の round-trip テストが通る
- [ ] クラスタ 0 件時は明確なエラー
- [ ] LLM 失敗時はクラスタ単位でスキップし続行（gitstyle 同様）

### Phase 2 見積もり

| PR | LOC 目安 |
|----|----------|
| PR-2a LLM 基盤 | ~150 |
| PR-2b extract | ~200 |
| PR-2c compile | ~350 |
| PR-2d lint | ~120 |
| models + tests | ~200 |
| **合計** | **~1000** |

---

## Phase 3: write

**ゴール:** エージェントがそのまま読める成果物を出力。

### 出力先（優先順）

| 優先 | 出力 | 用途 |
|------|------|------|
| 1 | `.cursor/rules/stylect-*.mdc` | Cursor エージェント |
| 2 | `wiki/`（gitstyle 互換） | Obsidian / 汎用 Markdown |
| 3 | Orbit persona / knowledge facet | Planetz 連携（将来） |

### PR-3a: Cursor rules  writer

```
.cursor/rules/
├── stylect-naming.mdc
├── stylect-patterns.mdc
├── stylect-testing.mdc
└── ...
```

**frontmatter 例:**

```yaml
---
description: Naming conventions mined from git history (stylect)
alwaysApply: false
globs: "**/*.{rb,ts,tsx}"
---
```

| タスク | 内容 |
|--------|------|
| `WikiArticle` → `.mdc` 変換 | `writer/cursor-rules.ts` |
| `--output` で rules ディレクトリ指定 | CLI |
| 次元 → ファイル名マッピング | |
| lint issues を footer に追記（任意） | |

### PR-3b: wiki writer

gitstyle `wiki_writer.py` 移植:

```
wiki/
├── index.md
├── naming-conventions.md
├── patterns.md
├── languages/
│   └── ruby.md
└── _meta/
    ├── sources.json
    ├── generation-config.json
    └── generation-log.md
```

### PR-3c: Orbit 連携（任意）

| タスク | 内容 |
|--------|------|
| persona markdown 出力 | `~/.takt/personas/<author>.md` 等 |
| Planetz knowledge facet JSON | Orbit スキーマ確定後 |

### Phase 3 見積もり: ~400 LOC

---

## Phase 4: 増分・公開・運用

### 増分パイプライン（gitstyle `_run_incremental_pipeline`）

新コミットのみ:

1. fetch（増分）→ sample（delta、`use_cache=false`）
2. extract（新クラスタのみ）→ merge extractions
3. compile（evolve プロンプト）→ lint → write

| 条件 | 動作 |
|------|------|
| 新コミット 0 & 成果物あり | 「up to date」で終了 |
| `--fresh` | 全キャッシュ削除、フル再実行 |

### npm 公開

| タスク | 内容 |
|------|------|
| `@guilz-dev/stylect` v0.2.0（Phase 1）/ v1.0.0（Phase 3） | |
| `files`: dist, README, LICENSE | 済み |
| GitHub Actions release workflow | 任意 |

### ドキュメント

| ドキュメント | タイミング |
|--------------|------------|
| README Quick start 更新 | Phase 1 完了 |
| `docs/cursor-rules.md` — 生成ルールの読み方 | Phase 3 |
| `docs/orbit.md` — persona 連携 | Phase 3c |

---

## 推奨 PR マージ順（全体）

```
1. PR-1a  CLI/config 整合
2. PR-1b  local-git fetch
3. PR-1c  pipeline 統合
4. PR-1d  テスト
   ─── v0.2.0 MVP（手動検証）───
5. PR-1e  GitHub fetch（任意）
6. PR-2a  LLM 基盤
7. PR-2b  extract
8. PR-2c  compile
9. PR-2d  lint
   ─── v0.5.0 LLM パイプライン ───
10. PR-3a cursor rules writer
11. PR-3b wiki writer
    ─── v1.0.0 製品利用可能 ───
12. Phase 4 増分 + npm
```

---

## 認証まとめ

| 段階 | 必要な認証 |
|------|------------|
| Phase 1 local-git | 不要（clone + `--author`） |
| Phase 1 repo languages | 任意（`gh auth token`） |
| Phase 1 GitHub fetch | `GITHUB_TOKEN` or `gh auth token` |
| Phase 2+ LLM | `CURSOR_API_KEY` |

---

## 手動検証（各フェーズ）

### Phase 1

```bash
cd /path/to/stylect
pnpm build

node dist/cli.js run \
  -r owner/repo \
  -a dev-user \
  --repo-path /path/to/local/clone \
  --since 2024-01-01 -n 500 -s 10
```

### Phase 2

```bash
export CURSOR_API_KEY=...
node dist/cli.js run \
  -r owner/repo \
  -a dev-user \
  --repo-path /path/to/local/clone \
  -n 200 -s 5
```

### Phase 3

```bash
node dist/cli.js run ... -o .cursor/rules/generated
ls .cursor/rules/generated/
```

---

## リスク（横断）

| リスク | フェーズ | 対策 |
|--------|----------|------|
| typecheck 未整合 | 今 | PR-1a を最優先 |
| `git show` 遅延 | Phase 1 | `-n` 上限、merge 除外 |
| LLM JSON パース失敗 | Phase 2 | リトライ + fence 除去 |
| 秘密情報 in patch | Phase 1–2 | パス除外 |
| Cursor API コスト | Phase 2 | `--plan` で見積もり、cluster 数表示 |
| gitstyle プロンプトの著作権 | Phase 2 | 文言を参考にしつつ stylect 用に調整・出典明記 |

---

## 関連ドキュメント

| ファイル | 内容 |
|----------|------|
| [phase1.md](./phase1.md) | fetch/sample の詳細設計 |
| [README.md](../README.md) | ユーザー向け概要（Phase 1 完了時に更新） |
| gitstyle `docs/pipeline.md` |  upstream パイプライン説明 |
