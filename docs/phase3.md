# Phase 3: write

**Goal:** `articles.json` + `lint.json` からエージェントがそのまま読める成果物（wiki / Cursor rules）を出力する。LLM は使わない。

**前提:** Phase 2（extract → compile → lint）完了済み。キャッシュは `~/.stylect/<slug>/` 配下。

**参照実装:** [arlington-labs/gitstyle](https://github.com/arlington-labs/gitstyle) `wiki_writer.py`

---

## 成功基準

| # | 基準 | 検証方法 |
|---|------|----------|
| 1 | `stylect run` 完走後 `--output` 配下に gitstyle 互換 wiki が生成される | `index.md`, `_meta/` 存在 |
| 2 | `--rules-dir` 配下に `stylect-*.mdc` が生成される | 次元・言語記事ごとにファイル |
| 3 | マルチ `--repo` で **1 つの** wiki / rules にマージされる | 2 repo 指定で単一 `index.md` |
| 4 | `--plan` / `--skip-llm` / LLM soft-stop 時は write しない | 出力ディレクトリ不変 |
| 5 | lint 失敗時も write は続行、exit code は 1 維持 | gitstyle 互換 |
| 6 | `pnpm test` 77+ 件通過、writer 単体テスト追加 | CI |
| 7 | README / Pipeline 表が Phase 番号と一致 | ドキュメント整合 |

**Phase 3 完了時点では Orbit 連携（PR-3c）はしない。**

---

## スコープ

### In

- wiki writer（gitstyle 互換ディレクトリ構造）
- Cursor rules writer（`.mdc` + frontmatter）
- パイプライン統合（lint 後、**全 repo 集約後に write 1 回**）
- CLI: `--rules-dir`, `config.rulesDir`
- マルチ repo 記事マージ（初版: 同一 slug は後勝ち + 出典ログ）
- テスト（writer 単体 + pipeline モック）

### Out

- Orbit persona / knowledge facet（PR-3c、スキーマ待ち）
- `stylect write` サブコマンド（Phase 3.1）
- write-only モード（キャッシュから write のみ、Phase 3.1）
- 増分 evolve write（Phase 4）

---

## レビュー反映: Phase 3 着手前の準備（PR-3-prep）

Phase 3 実装の **前** にマージする小 PR。デグレ防止が目的。

| タスク | ファイル | 理由 |
|--------|----------|------|
| `pipeline/run.ts` 分割 | `per-repo.ts`, `log.ts`, `types.ts` | write 追加で God function 化を防ぐ |
| `RepoLlmResult` 型導入 | `pipeline/types.ts` | ループ内で articles/lint を集約する下地 |
| `PipelineRunResult` 改善 | `pipeline/types.ts`, `cli.ts` | `llmSkipped` を boolean 単体から per-repo 表現へ |
| README Pipeline 表修正 | `README.md` | write を Phase 3 と明記（現状 Phase 2 と誤記） |
| `extract/dimensions.ts` shim 削除 | import を `models/style-dimension` に統一 | 薄いラッパー整理 |

**任意（Phase 3 と並行可）:**

| タスク | ファイル |
|--------|----------|
| sample I/O 分離 | `sample/index.ts` → pipeline 側で load/save |
| `resolveLlmStageNeeds` を stage ガードに接続 | 未使用判定ロジックの整理 |

**見積もり:** ~120 LOC + テスト更新

---

## パイプライン設計

### 全体フロー

```
for each repo:
  fetch → sample → [LLM: extract → compile → lint]
  repoResults.push({ repo, articles, lint, ... })   ← 必須

if shouldWrite(config, repoResults):
  merged = mergeRepoArtifacts(repoResults)
  writeArtifacts(merged, config)                   ← 1 回のみ
```

**デグレ注意:** ループ内で write しない。最後の repo だけ出力するバグを防ぐ。

### write 実行条件

| 条件 | write |
|------|-------|
| `--plan` | しない |
| `--skip-llm` | しない |
| LLM soft-stop（`CURSOR_API_KEY` なし） | しない |
| 全 repo の `articles` 合計 0 件 | しない（警告を stderr） |
| lint `passed: false` | **する**（exit code 1 は維持） |
| 上記以外 | する |

### マルチ repo マージ（初版）

```typescript
type RepoLlmResult = {
  repo: string
  articles: WikiArticle[]
  lint: LintReport
}

type MergedArtifacts = {
  articles: WikiArticle[]
  lint: LintReport
  sourceRepos: string[]   // マージに参加した repo 一覧
}
```

| フィールド | マージルール |
|------------|--------------|
| 同一 `slug` の記事 | **後勝ち**（ループ順 = `--repo` 指定順） |
| `sourceRepos` | union（記事ごと） |
| `confidence` | 勝った記事の値を採用 |
| lint `issues` | 全 repo の issues を concat |
| lint `passed` | 全 repo が passed のときのみ true |

**可観測性（必須）:** `_meta/generation-log.md` に以下を記録:

- マージ参加 repo 一覧
- slug ごとの上書き（`patterns: repo-a → repo-b`）
- lint 集約結果

---

## ディレクトリ構成（追加）

```
src/
├── writer/
│   ├── index.ts           # writeArtifacts()
│   ├── types.ts           # WriteResult, MergedArtifacts
│   ├── merge.ts           # mergeRepoArtifacts()
│   ├── wiki.ts            # PR-3b
│   ├── cursor-rules.ts    # PR-3a
│   ├── frontmatter.ts     # YAML 生成（共有）
│   ├── wikilinks.ts       # [[slug]] 変換（rules 用）
│   └── globs.ts           # 次元/言語 → globs
└── pipeline/
    ├── run.ts             # オーケストレーション
    ├── per-repo.ts        # PR-3-prep: fetch → lint ループ
    ├── log.ts             # PR-3-prep: サマリ出力
    └── types.ts           # PR-3-prep: RepoLlmResult
```

---

## CLI / 設定

| フラグ | 説明 | デフォルト |
|--------|------|-----------|
| `-o, --output` | wiki 出力先 | `./wiki` |
| `--rules-dir` | `.mdc` 出力先 | `./.cursor/rules` |

`config.ts` 追加:

```typescript
rulesDir: string          // default: join(cwd, '.cursor/rules')
writeWiki: boolean        // default: true（初版は常時 on、フラグ省略可）
writeRules: boolean       // default: true
lintFooter: boolean       // rules に lint issues を載せる（default: true）
```

**PR-3b と同時に** `parse-args.ts` / `cli.ts` help を更新する（`outputDir` が効かない状態を残さない）。

---

## PR 単位

### PR-3-prep: パイプライン整理（先行・必須）

| タスク | 内容 |
|--------|------|
| `run.ts` 分割 | per-repo / log / types |
| `RepoLlmResult` | ループ内で push |
| `PipelineRunResult` | per-repo skipped 情報 |
| README 修正 | write = Phase 3 |
| テスト更新 | `pipeline/__tests__/run.test.ts` |

### PR-3b: wiki writer（先行）

gitstyle `wiki_writer.py` 移植。

```
wiki/
├── index.md
├── naming-conventions.md
├── patterns.md
├── languages/
│   └── ruby.md
└── _meta/
    ├── sources.md
    ├── generation-config.md
    └── generation-log.md
```

| タスク | ファイル |
|--------|----------|
| 次元記事 → `{slug}.md` | `writer/wiki.ts` |
| 言語記事 → `languages/{slug}.md` | `writer/wiki.ts` |
| `index.md`（Obsidian wikilink） | `writer/wiki.ts` |
| `_meta/*` 3 ファイル | `writer/wiki.ts` |
| テスト（fixture `WikiArticle[]`、temp dir） | `writer/__tests__/wiki.test.ts` |

**gitstyle 差分:** `sources.json` ではなく `sources.md`（upstream 踏襲）。

**見積もり:** ~200 LOC + tests ~100 LOC

### PR-3a: Cursor rules writer

```
.cursor/rules/
├── stylect-naming-conventions.mdc
├── stylect-patterns.mdc
├── stylect-testing.mdc
└── stylect-ruby.mdc
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
| `WikiArticle` → `.mdc` | `writer/cursor-rules.ts` |
| ファイル名 `stylect-{slug}.mdc` | 次元・言語共通 |
| `[[wikilinks]]` → プレーン Markdown リンク | `writer/wikilinks.ts` |
| globs マッピング | `writer/globs.ts` |
| lint issues footer（`lintFooter`） | 任意、デフォルト on |
| テスト | `writer/__tests__/cursor-rules.test.ts` |

**globs 初版:**

| slug | globs |
|------|-------|
| `testing` | `**/*.{test,spec}.{ts,js,rb}` |
| `ruby` 等の言語記事 | `**/*.{rb,rake}` 等 |
| その他 | `**/*` |

**見積もり:** ~150 LOC + tests ~80 LOC

### PR-3-pipeline: 統合

| タスク | 内容 |
|--------|------|
| `mergeRepoArtifacts` | `writer/merge.ts` |
| `writeArtifacts` | `writer/index.ts` |
| `run.ts` ループ後に write 1 回 | `pipeline/run.ts` |
| stdout サマリ（書き込みファイル数） | `pipeline/log.ts` |
| `formatPlan` から「not implemented」削除 | `pipeline/run.ts` |
| pipeline テスト（write モック） | `pipeline/__tests__/run.test.ts` |

**見積もり:** ~100 LOC

### PR-3c: Orbit 連携（保留）

| タスク | 条件 |
|--------|------|
| persona markdown | Orbit スキーマ確定後 |
| knowledge facet JSON | Planetz 連携仕様確定後 |

---

## 推奨マージ順

```
PR-3-prep   パイプライン整理 + README（必須・先行）
PR-3b       wiki writer
PR-3a       cursor rules writer
PR-3-pipeline  merge + run 統合 + CLI --rules-dir
─── v1.0.0 製品利用可能 ───
PR-3c       Orbit（任意・後日）
```

---

## テスト方針

| レイヤ | 方針 |
|--------|------|
| `writer/*` | fixture `WikiArticle[]` + temp dir。LLM モック不要 |
| `writer/merge.ts` | 2 repo 同一 slug の後勝ち、lint concat |
| `pipeline/run.ts` | write をモック。実ファイル I/O しない |
| E2E | 手動（`CURSOR_API_KEY` + 実 clone） |

**追加必須ケース:**

- 2 repo: A soft-stop、B キャッシュ完走 → write は B のみ（または空）
- articles 0 件 → write スキップ
- lint 失敗 → write 実行 + exit 1

---

## 手動検証

```bash
cd /path/to/stylect
pnpm build

export CURSOR_API_KEY=...
node dist/cli.js run \
  -r owner/repo \
  -a you \
  --repo-path /path/to/local/clone \
  -o ./wiki \
  --rules-dir ./.cursor/rules \
  -n 200 -s 5

ls wiki/ wiki/languages/ wiki/_meta/
ls .cursor/rules/stylect-*.mdc
cat wiki/_meta/generation-log.md
```

**キャッシュのみ再 write（Phase 3.1）:**

```bash
stylect write -r owner/repo -o ./wiki --rules-dir ./.cursor/rules
# カスタムキャッシュ: --cache ~/.stylect
```

---

## リスクと対策

| リスク | 対策 |
|--------|------|
| 最後の repo だけ write | `RepoLlmResult[]` 集約を PR-3-prep で先に入れる |
| マルチ repo 上書きが不透明 | `generation-log.md` にマージログ |
| `outputDir` が未接続 | PR-3b と同時に CLI 接続 |
| `[[wikilinks]]` が Cursor で無効 | rules 出力時にプレーンリンクへ変換 |
| pipeline 肥大化 | PR-3-prep で分割してから write 追加 |
| テストが `~/.stylect` を汚す | writer 単体は temp dir、pipeline はモック |

---

## Phase 3 完了チェックリスト

- [x] PR-3-prep マージ済み
- [x] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` 成功
- [x] wiki + `.mdc` が生成される
- [x] マルチ repo で単一 wiki
- [x] `_meta/generation-log.md` にマージ情報
- [x] `--skip-llm` で write しない
- [x] lint 失敗時 write 続行・exit 1
- [x] `docs/cursor-rules.md`（読み方）追加
- [x] README 更新

---

## 見積もり合計

| PR | LOC 目安 |
|----|----------|
| PR-3-prep | ~120 |
| PR-3b wiki | ~300 |
| PR-3a rules | ~230 |
| PR-3-pipeline | ~100 |
| **合計** | **~750** |

---

## 関連ドキュメント

| ファイル | 内容 |
|----------|------|
| [implementation-plan.md](./implementation-plan.md) | 全体ロードマップ |
| [phase1.md](./phase1.md) | fetch/sample 詳細 |
| [README.md](../README.md) | ユーザー向け Quick start |
