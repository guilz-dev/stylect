# Generated Cursor rules

Stylect writes `.cursor/rules/stylect-*.mdc` files after the lint stage. Each file maps to one wiki article (style dimension or language).

## File naming

```
.cursor/rules/
├── stylect-naming-conventions.mdc
├── stylect-patterns.mdc
├── stylect-testing.mdc
└── stylect-ruby.mdc
```

## Frontmatter

Each rule includes YAML frontmatter:

- `description` — human-readable summary
- `alwaysApply: false` — opt-in per glob match
- `globs` — file patterns the rule applies to

## Wikilinks

Wiki articles use Obsidian `[[wikilinks]]`. Cursor rules convert these to plain Markdown links (e.g. `[Testing](testing.md)`).

## Lint footer

When enabled (default), lint issues for each article are appended under `## Lint notes`.

## CLI

```bash
stylect run \
  --author you \
  --repo owner/repo \
  --rules-dir ./.cursor/rules \
  -o ./wiki
```

Use `--rules-dir` to change the output directory. Wiki output uses `-o` / `--output`.
