# Phase 1: fetch + sample

**Goal:** git 履歴からコミット + diff を集め、repo × 言語クラスタごとに代表サンプルを選び、キャッシュに保存する。LLM は使わない。

**参照実装:** [arlington-labs/gitstyle](https://github.com/arlington-labs/gitstyle) `fetch.py`, `sample.py`, `models.py`

**stylect の差別化:** 組織リポでも `--author` で個人コミットだけ抽出できる（local git 優先）。

---

## 成功基準

| # | 基準 | 検証方法 |
|---|------|----------|
| 1 | `stylect run -r owner/repo -a author` で fetch → sample が完走する | exit 0 |
| 2 | `~/.stylect/<slug>/commits.jsonl` に RawCommit が書き込まれる | ファイル存在・JSONL パース（snake_case） |
| 3 | `~/.stylect/<slug>/samples.json` に SampledCluster が書き込まれる | クラスタ数 > 0（対象コミットがある場合） |
| 4 | 2 回目実行で増分 fetch が動く（`--fresh` 除く） | 新コミットのみ追記、sample は再計算 |
| 5 | `pnpm test` / CI が通る | unit + fixture テスト |
| 6 | `example-app` ローカル clone で author フィルタが効く | dev-user のコミットのみ |
| 7 | `--author` 未指定時はエラー | 個人抽出を誤って全員分取らない |

**Phase 1 完了時点では LLM・wiki・`.cursor/rules` 出力はしない。**

**MVP（手動検証）:** PR-1 + PR-2 + PR-4 で完結。PR-3（GitHub フォールバック）は後回し可。

---

## スコープ

### In

- `fetch`（local git 優先 + GitHub API フォールバック）
- `sample`（gitstyle と同じクラスタリング・サンプリング）
- キャッシュ読み書き（JSONL + JSON）
- CLI `run` の Phase 1 動作
- 単体テスト（sample ロジック、パース、キャッシュ）

### Out（Phase 2 以降）

- extract / compile / lint（`@cursor/sdk`）
- `write`（wiki / `.cursor/rules/*.mdc`）
- Web viewer、Orbit persona 連携
- 並列 GitHub API の高度なレート制限戦略
- `stylect fetch` / `stylect sample` サブコマンド（Phase 1.1）

---

## gitstyle との互換範囲

| 項目 | gitstyle | stylect Phase 1 |
|------|----------|-----------------|
| ファイル名 | `commits.jsonl`, `samples.json` | 同じ |
| JSON フィールド名 | snake_case（Pydantic 既定） | **ディスク上は snake_case 固定** |
| キャッシュディレクトリ | `<cache>/` フラット（username 単位） | `~/.stylect/<owner__name>/` **repo 別**（意図的差分） |
| sample アルゴリズム | 最近 / 大きい / random(42) | 同じ |
| sample キャッシュ | 存在すれば commits を無視 | **新コミット時は必ず再計算**（意図的改善） |

---

## CLI セマンティクス（現状からの変更）

現状の `--dry-run` は「設定プラン表示のみ」。Phase 1 で次のように整理する。

| モード | 動作 |
|--------|------|
| `stylect run ...`（Phase 1） | **fetch → sample → キャッシュ保存** で停止 |
| `stylect run ... --plan`（新規） | 設定プランのみ（現 `--dry-run` 相当） |
| `stylect run ...`（Phase 2 以降、`CURSOR_API_KEY` あり） | fetch → sample → extract → compile → lint → write |

- `--dry-run` は **非推奨**。移行期間は `--plan` の alias。
- `--author` は **Phase 1 では必須**（未指定はエラー）。
- **GitHub token** は `--source github`、または `auto` で GitHub にフォールバックするときのみ必須。local-git のみなら不要。

### `cli.ts` の変更点

```ts
// token 必須条件（Phase 1）
const needsGitHub =
  config.source === 'github' ||
  (config.source === 'auto' && !resolveRepoPath(config))

if (needsGitHub && !config.plan) {
  const token = await resolveGitHubToken(config.githubToken)
  if (!token) throw new Error('...')
  config.githubToken = token
}

// planPipeline は config.plan のときのみ。dryRun とは切り離す
```

### 設定の単一ソース

`parse-args.ts` はハードコードせず **`defaultConfig()` を必ず経由**する。

| 項目 | デフォルト |
|------|-----------|
| `cacheDir` | `~/.stylect`（`homedir()` 配下） |
| `outputDir` | `./wiki`（cwd 相対） |

repo ごとの実パス: `join(cacheDir, repoToSlug(repo))`

---

## ディレクトリ構成（追加）

```
src/
├── models/
│   ├── commit.ts          # CommitFile, RawCommit（内部型）
│   ├── cluster.ts         # SampledCluster, FetchResult
│   └── serialize.ts       # snake_case ↔ TS 型の変換
├── fetch/
│   ├── index.ts           # fetch(config) → FetchResult
│   ├── local-git.ts       # ローカル clone から取得（優先）
│   ├── github.ts          # Octokit（フォールバック、PR-3）
│   └── cache.ts           # commits.jsonl 読み書き・増分
├── sample/
│   ├── index.ts           # sample(commits, config) → SampledCluster[]
│   └── select.ts          # _sample_group 移植
├── pipeline/
│   └── run.ts             # orchestrator 更新
└── util/
    ├── language.ts        # 拡張子 → 言語名（フォールバック用）
    └── repo-path.ts       # ローカル clone パス解決
```

テストは agent-belay 踏襲で `src/**/__tests__/` に置く（committed `.git` fixture は使わない。`mkdtemp` + `git init` で生成）。

---

## データモデル

### TypeScript 内部型（camelCase）

```ts
type CommitFile = {
  filename: string
  status: 'added' | 'modified' | 'removed' | 'renamed'
  additions: number
  deletions: number
  patch?: string
}

type RawCommit = {
  sha: string
  repo: string
  message: string
  author: string
  authoredAt: string // ISO 8601
  additions: number
  deletions: number
  files: CommitFile[]
  languages: string[] // repo 単位の言語リスト（gitstyle 同様）
}

type SampledCluster = {
  repo: string
  language: string
  commits: RawCommit[]
  totalInGroup: number
}
```

### ディスク上の JSON（snake_case、gitstyle 互換）

`serialize.ts` で read/write 時に変換する。

```json
{
  "sha": "abc123",
  "repo": "owner/name",
  "message": "fix: ...",
  "author": "dev-user",
  "authored_at": "2024-06-01T12:00:00Z",
  "additions": 10,
  "deletions": 2,
  "files": [],
  "languages": ["Ruby", "TypeScript"]
}
```

```json
{
  "repo": "owner/name",
  "language": "Ruby",
  "commits": [],
  "total_in_group": 120
}
```

---

## キャッシュレイアウト

```
~/.stylect/                       # defaultConfig().cacheDir
└── <owner__name>/                # owner__repo
    ├── commits.jsonl             # 1行1 RawCommit（snake_case）
    ├── samples.json              # SampledCluster[]（snake_case）
    └── meta.json                 # last_fetch_at, source, author, language_source
```

- `--cache <dir>` でルートを上書き可能
- `--fresh` で当該 repo サブディレクトリを削除してフル fetch
- 空結果はキャッシュしない（gitstyle 同様）

---

## fetch 設計

### 戦略: local git 優先

```
resolveRepoPath(repo) → パスがあれば local-git
                     → なければ github（要 token）
```

**ローカルパス解決順:**

1. `--repo-path <dir>`（`-r` と対応。複数 repo 時は `--repo-path` を繰り返し、または将来 config ファイル）
2. `process.cwd()` が該当 `origin` の clone なら cwd
3. `REPO_SEARCH_PATHS` env（コロン区切り）配下の `<repo-name>` ディレクトリ

### multi-repo の `maxCommits` 配分

gitstyle と同様、repo ごとに均等配分:

```ts
const perRepo = Math.max(1, Math.floor(config.maxCommits / config.repos.length))
```

### local-git.ts

`git` サブプロセス（追加依存なし）。**コミットあたり `git show` は 1 回**（ファイルごとに叩かない）。

```bash
# コミット一覧（merge は除外）
git -C <path> log \
  --no-merges \
  --author=<author> \
  --since=<since> --until=<until> \
  -n <perRepo> \
  --format=%H%x09%an%x09%ae%x09%aI%x09%s

# 各 SHA: numstat + 全 patch を 1 回で取得
git -C <path> show <sha> --format= --numstat
git -C <path> show <sha> --format= -p
```

取得した unified diff をファイル境界でパースし `CommitFile[]` を組み立てる。

| 項目 | 方針 |
|------|------|
| author | `--author` を `git log --author` にそのまま渡す。複数 alias は Phase 1.1 |
| merge commit | デフォルト `--no-merges` |
| 秘密っぽいパス | `.env`, `credentials`, `*.pem` 等は `files` から除外（patch も取らない） |
| patch サイズ | 単一ファイル patch が 100KB 超なら truncate |
| binary | patch なしで filename + stats のみ |

### 言語クラスタリング（gitstyle セマンティクス）

gitstyle は **リポジトリ全体の languages** を各コミットに付与し、言語ごとにコミットを複製してクラスタに入れる。

Phase 1 の優先順位:

1. **repo languages** — token があれば `GET /repos/{repo}/languages` を 1 回（local-git でも可）
2. **フォールバック** — コミット内変更ファイルの拡張子から推定した言語の和集合
3. どちらも空 → `["unknown"]`

`meta.json` に `language_source: "github" | "extensions"` を記録する。

### github.ts（フォールバック、PR-3）

- `@octokit/rest` + `resolveGitHubToken()`
- gitstyle の `fetch_commits_for_repo` を移植
- **author フィルタは常に有効**
- レート制限: 403 + `X-RateLimit-Reset` 待機

### 増分 fetch

gitstyle `fetch.py` と同じ:

1. `commits.jsonl` が存在 & `!fresh` → incremental
2. キャッシュ内の最新 `authored_at` を `since` に（境界 SHA は dedupe）
3. 新 SHA のみマージして保存

---

## sample 設計（gitstyle 移植）

### クラスタリング

- キー: `(repo, language)`
- 各コミットは `languages[]` の各言語に所属（gitstyle 同様）
- `languages` 空 → `(repo, "unknown")`

### サンプリング（`_sample_group`）

`n = samplesPerGroup`（default 20）:

1. **最近** `n // 3` 件（`authoredAt` desc）
2. **大きい diff** `n // 3` 件（`additions + deletions` desc）
3. **ランダム補充** 残り（`seed = 42`）

### キャッシュ（gitstyle からの改善）

```ts
function shouldUseSampleCache(
  fresh: boolean,
  cacheExists: boolean,
  newCommitCount: number,
): boolean {
  return !fresh && cacheExists && newCommitCount === 0
}
```

- 上記が true → `samples.json` を読み込んで返す
- それ以外 → **全 `allCommits` から再サンプル**して `samples.json` を上書き

gitstyle は `samples.json` があれば commits リストを無視するため、stylect は意図的に改善する。

---

## pipeline 更新

```ts
async function runPipeline(config: StylectConfig) {
  if (config.plan) {
    process.stdout.write(formatPlan(planPipeline(config)))
    return
  }

  if (!config.author) {
    throw new Error('--author is required in Phase 1')
  }

  for (const repo of config.repos) {
    const slug = repoToSlug(repo)
    const repoConfig = { ...config, maxCommits: perRepoLimit(config, repo) }
    const fetchResult = await fetch(repo, repoConfig)
    const clusters = await sample(fetchResult, repoConfig, { slug })
    logSummary(repo, fetchResult, clusters)
  }
  // Phase 2: if (config.cursorApiKey) { extract → ... }
}
```

**stdout サマリ例:**

```
repo: owner/repo
source: local-git (/Users/kaz/.../example-app)
language_source: github
fetched: 847 commits (12 new)
clusters: 6 (ruby×3, typescript×2, unknown×1)
sampled: 94 commits → ~/.stylect/owner__repo/samples.json
```

---

## 新規・変更 CLI オプション

| フラグ | 用途 |
|--------|------|
| `--repo-path <dir>` | ローカル clone（`-r` と対応、繰り返し可） |
| `--plan` | プラン表示のみ |
| `--dry-run` | `--plan` の alias（非推奨） |
| `--source local\|github\|auto` | fetch ソース（default: `auto`） |

### `StylectConfig` 追加フィールド

```ts
type StylectConfig = {
  // 既存 ...
  plan: boolean           // 旧 dryRun のプラン用途
  repoPaths: string[]     // --repo-path（repos と同順 or 1:1）
  source: 'auto' | 'local' | 'github'
}
```

`dryRun` は deprecated alias → `plan` にマップ。`planPipeline` の LLM 判定は `config.plan` と分離する。

---

## 依存パッケージ（Phase 1）

| パッケージ | 用途 | PR |
|------------|------|-----|
| （なし） | local-git | PR-2 |
| `@octokit/rest` | GitHub フォールバック + repo languages | PR-3 |

`simple-git` は使わない。

---

## テスト計画

| テスト | 内容 |
|--------|------|
| `src/sample/__tests__/select.test.ts` | 件数、重複なし、seed 再現性（gitstyle `test_sample.py` 相当） |
| `src/util/__tests__/language.test.ts` | 拡張子フォールバック |
| `src/models/__tests__/serialize.test.ts` | snake_case round-trip |
| `src/fetch/__tests__/cache.test.ts` | JSONL 増分マージ |
| `src/fetch/__tests__/local-git.test.ts` | テスト内で temp repo 生成 |
| `src/parse-args.test.ts` | `--repo-path`, `--plan`, `defaultConfig` 統一 |

---

## 実装タスク（順序）

### PR-1: モデル + sample

1. `src/models/*` + `serialize.ts`
2. `src/sample/select.ts` + `index.ts`
3. `src/sample/__tests__/select.test.ts`
4. sample キャッシュ判定 `shouldUseSampleCache`

### PR-2: local-git fetch + cache + 増分

1. `src/util/language.ts`, `repo-path.ts`
2. `src/fetch/local-git.ts`（コミット 1 回 `git show -p`）
3. `src/fetch/cache.ts` + 増分ロジック
4. `meta.json` 書き込み
5. temp repo テスト
6. `--repo-path`, `--author` 必須, `defaultConfig()` 統一

### PR-3: GitHub fetch（後回し可）

1. `src/fetch/github.ts`
2. repo languages API
3. Octokit レート制限

### PR-4: pipeline 統合 + CLI 整理

1. `src/fetch/index.ts`（auto 戦略）
2. `runPipeline` 完走
3. `--plan` / `--dry-run` alias、token 条件分岐
4. README 更新

---

## 実装前チェックリスト

- [ ] `parse-args` → `defaultConfig()` 統一（`cacheDir` = `~/.stylect`）
- [ ] `StylectConfig` に `plan`, `repoPaths`, `source` 追加
- [ ] `cli.ts` token 必須を GitHub フォールバック時のみに限定
- [ ] ディスク JSON は snake_case（`serialize.ts`）
- [ ] sample キャッシュ: `newCommits.length === 0` のときのみヒット
- [ ] local-git: コミットあたり `git show -p` 1 回
- [ ] `--author` 未指定はエラー
- [ ] multi-repo `maxCommits` 均等配分

---

## 手動検証コマンド（com リポ）

```bash
cd /path/to/stylect
pnpm build

# プランのみ
node dist/cli.js run \
  -r owner/repo \
  -a dev-user \
  --repo-path /path/to/local/clone \
  --since 2024-01-01 \
  --plan

# Phase 1 本番（fetch + sample、token 不要）
node dist/cli.js run \
  -r owner/repo \
  -a dev-user \
  --repo-path /path/to/local/clone \
  --since 2024-01-01 \
  -n 500 \
  -s 10

# キャッシュ確認
ls ~/.stylect/owner__repo/
jq '.[0] | keys' ~/.stylect/owner__repo/samples.json
head -1 ~/.stylect/owner__repo/commits.jsonl | jq 'keys'
```

---

## リスクと判断

| リスク | 対策 |
|--------|------|
| ローカル clone が無い | GitHub フォールバック + `--repo-path` を案内 |
| `git show` が遅い | コミット 1 回に集約、`-n` で上限、merge 除外 |
| author が name/email と不一致 | README に `git log --author` の確認手順 |
| patch / 秘密情報 | 感度の高いパスを除外、巨大 patch は truncate |
| `--dry-run` の意味変更 | `--plan` + alias |
| gitstyle sample キャッシュの陳腐化 | 新コミット時は必ず再サンプル |

---

## Phase 2 へのインターフェース

- `~/.stylect/<slug>/samples.json` のスキーマ（snake_case）を固定
- `SampledCluster.commits[].files[].patch` が extract 入力
- gitstyle の 9 次元は Phase 2 で `src/extract/dimensions.ts` に移植

---

## 見積もり

| PR | 規模 |
|----|------|
| PR-1 sample + serialize | ~250 LOC + テスト |
| PR-2 local-git + cache + 増分 | ~350 LOC + テスト |
| PR-3 github（任意） | ~250 LOC |
| PR-4 統合 | ~150 LOC |

**MVP 合計: ~750 LOC**（PR-1 + PR-2 + PR-4）
