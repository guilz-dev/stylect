import { homedir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { defaultConfig } from '../config.js'
import { parseArgv } from '../parse-args.js'
import { formatPlan, planPipeline } from '../pipeline/run.js'

describe('parseArgv', () => {
  it('parses run with repo and author', () => {
    const parsed = parseArgv(['run', '--repo', 'owner/repo', '--author', 'dev-user', '--plan'])
    expect(parsed.command).toBe('run')
    expect(parsed.config.repos).toEqual(['owner/repo'])
    expect(parsed.config.author).toBe('dev-user')
    expect(parsed.config.plan).toBe(true)
  })

  it('maps --dry-run to plan', () => {
    const parsed = parseArgv(['run', '--repo', 'owner/repo', '--dry-run'])
    expect(parsed.config.plan).toBe(true)
    expect(parsed.config.dryRun).toBe(true)
  })

  it('uses defaultConfig for cacheDir', () => {
    const parsed = parseArgv(['run', '--repo', 'owner/repo'])
    expect(parsed.config.cacheDir).toBe(join(homedir(), '.stylect'))
  })

  it('uses defaultConfig for outputDir', () => {
    const parsed = parseArgv(['run', '--repo', 'owner/repo'])
    expect(parsed.config.outputDir).toBe(join(process.cwd(), 'wiki'))
  })

  it('uses the provider default model when defaultConfig overrides llmProvider', () => {
    const config = defaultConfig({ llmProvider: 'openai' })
    expect(config.llmProvider).toBe('openai')
    expect(config.model).toBe('gpt-4.1-mini')
  })

  it('parses --skip-llm', () => {
    const parsed = parseArgv(['run', '--repo', 'owner/repo', '--skip-llm'])
    expect(parsed.config.skipLlm).toBe(true)
  })

  it('parses --model', () => {
    const parsed = parseArgv(['run', '--repo', 'owner/repo', '--model', 'composer-2.5'])
    expect(parsed.config.model).toBe('composer-2.5')
  })

  it('parses --llm-provider and swaps the default model', () => {
    const parsed = parseArgv(['run', '--repo', 'owner/repo', '--llm-provider', 'openai'])
    expect(parsed.config.llmProvider).toBe('openai')
    expect(parsed.config.model).toBe('gpt-4.1-mini')
  })

  it('resets model when --model appears before --llm-provider', () => {
    const parsed = parseArgv([
      'run',
      '--repo',
      'owner/repo',
      '--model',
      'composer-2.5',
      '--llm-provider',
      'openai',
    ])
    expect(parsed.config.llmProvider).toBe('openai')
    expect(parsed.config.model).toBe('gpt-4.1-mini')
  })

  it('keeps model when it appears after --llm-provider', () => {
    const parsed = parseArgv([
      'run',
      '--repo',
      'owner/repo',
      '--llm-provider',
      'openai',
      '--model',
      'gpt-4.1',
    ])
    expect(parsed.config.llmProvider).toBe('openai')
    expect(parsed.config.model).toBe('gpt-4.1')
  })

  it('parses --llm-api-key', () => {
    const parsed = parseArgv(['run', '--repo', 'owner/repo', '--llm-api-key', 'secret'])
    expect(parsed.config.llmApiKey).toBe('secret')
  })

  it('parses --output-lang', () => {
    const parsed = parseArgv(['run', '--repo', 'owner/repo', '--output-lang', 'ja'])
    expect(parsed.config.outputLanguage).toBe('ja')
  })

  it('uses STYLECT_OUTPUT_LANG when flag is absent', () => {
    const previous = process.env.STYLECT_OUTPUT_LANG
    process.env.STYLECT_OUTPUT_LANG = 'ja'
    try {
      const parsed = parseArgv(['run', '--repo', 'owner/repo'])
      expect(parsed.config.outputLanguage).toBe('ja')
    } finally {
      if (previous === undefined) {
        delete process.env.STYLECT_OUTPUT_LANG
      } else {
        process.env.STYLECT_OUTPUT_LANG = previous
      }
    }
  })

  it('uses STYLECT_LLM_PROVIDER when flag is absent', () => {
    const previous = process.env.STYLECT_LLM_PROVIDER
    process.env.STYLECT_LLM_PROVIDER = 'anthropic'
    try {
      const parsed = parseArgv(['run', '--repo', 'owner/repo'])
      expect(parsed.config.llmProvider).toBe('anthropic')
      expect(parsed.config.model).toBe('claude-3-5-sonnet-latest')
    } finally {
      if (previous === undefined) {
        delete process.env.STYLECT_LLM_PROVIDER
      } else {
        process.env.STYLECT_LLM_PROVIDER = previous
      }
    }
  })

  it('rejects invalid --output-lang values', () => {
    expect(() => parseArgv(['run', '--repo', 'owner/repo', '--output-lang', 'fr'])).toThrow(
      /expected en or ja/,
    )
  })

  it('rejects invalid STYLECT_OUTPUT_LANG values', () => {
    const previous = process.env.STYLECT_OUTPUT_LANG
    process.env.STYLECT_OUTPUT_LANG = 'fr'
    try {
      expect(() => parseArgv(['run', '--repo', 'owner/repo'])).toThrow(/expected en or ja/)
    } finally {
      if (previous === undefined) {
        delete process.env.STYLECT_OUTPUT_LANG
      } else {
        process.env.STYLECT_OUTPUT_LANG = previous
      }
    }
  })

  it('rejects invalid STYLECT_LLM_PROVIDER values', () => {
    const previous = process.env.STYLECT_LLM_PROVIDER
    process.env.STYLECT_LLM_PROVIDER = 'bedrock'
    try {
      expect(() => parseArgv(['run', '--repo', 'owner/repo'])).toThrow(
        /expected anthropic, cursor, or openai/,
      )
    } finally {
      if (previous === undefined) {
        delete process.env.STYLECT_LLM_PROVIDER
      } else {
        process.env.STYLECT_LLM_PROVIDER = previous
      }
    }
  })

  it('allows help/version even when STYLECT_OUTPUT_LANG is invalid', () => {
    const previousOutputLang = process.env.STYLECT_OUTPUT_LANG
    const previousProvider = process.env.STYLECT_LLM_PROVIDER
    process.env.STYLECT_OUTPUT_LANG = 'fr'
    process.env.STYLECT_LLM_PROVIDER = 'bedrock'
    try {
      expect(parseArgv(['--version']).command).toBe('version')
      expect(parseArgv(['run', '--help']).command).toBe('help')
    } finally {
      if (previousOutputLang === undefined) {
        delete process.env.STYLECT_OUTPUT_LANG
      } else {
        process.env.STYLECT_OUTPUT_LANG = previousOutputLang
      }
      if (previousProvider === undefined) {
        delete process.env.STYLECT_LLM_PROVIDER
      } else {
        process.env.STYLECT_LLM_PROVIDER = previousProvider
      }
    }
  })

  it('parses --repo-path and --source', () => {
    const parsed = parseArgv([
      'run',
      '--repo',
      'owner/repo',
      '--repo-path',
      '/tmp/repo',
      '--source',
      'local',
    ])
    expect(parsed.config.repoPaths).toEqual(['/tmp/repo'])
    expect(parsed.config.source).toBe('local')
  })

  it('parses --rules-dir', () => {
    const parsed = parseArgv(['run', '--repo', 'owner/repo', '--rules-dir', '/tmp/rules'])
    expect(parsed.config.rulesDir).toBe('/tmp/rules')
  })

  it('requires --repo for run', () => {
    expect(() => parseArgv(['run', '--plan'])).toThrow(/requires at least one --repo/)
  })

  it('parses write with repo and output paths', () => {
    const parsed = parseArgv([
      'write',
      '--repo',
      'owner/repo',
      '--output',
      '/tmp/wiki',
      '--rules-dir',
      '/tmp/rules',
      '--cache',
      '/tmp/cache',
    ])
    expect(parsed.command).toBe('write')
    expect(parsed.config.repos).toEqual(['owner/repo'])
    expect(parsed.config.outputDir).toBe('/tmp/wiki')
    expect(parsed.config.rulesDir).toBe('/tmp/rules')
    expect(parsed.config.cacheDir).toBe('/tmp/cache')
  })

  it('requires --repo for write', () => {
    expect(() => parseArgv(['write'])).toThrow(/requires at least one --repo/)
  })

  it('parses fetch with repo and author', () => {
    const parsed = parseArgv(['fetch', '--repo', 'owner/repo', '--author', 'dev-user'])
    expect(parsed.command).toBe('fetch')
    expect(parsed.config.repos).toEqual(['owner/repo'])
    expect(parsed.config.author).toBe('dev-user')
  })

  it('parses sample with repo', () => {
    const parsed = parseArgv(['sample', '--repo', 'owner/repo', '--fresh'])
    expect(parsed.command).toBe('sample')
    expect(parsed.config.repos).toEqual(['owner/repo'])
    expect(parsed.config.fresh).toBe(true)
  })

  it('requires --repo for fetch', () => {
    expect(() => parseArgv(['fetch', '--author', 'dev-user'])).toThrow(
      /requires at least one --repo/,
    )
  })

  it('requires --repo for sample', () => {
    expect(() => parseArgv(['sample'])).toThrow(/requires at least one --repo/)
  })
})

describe('planPipeline', () => {
  it('skips LLM stages in plan mode', () => {
    const plan = planPipeline(
      defaultConfig({
        repos: ['owner/repo'],
        plan: true,
      }),
    )
    expect(plan.llmStages).toEqual([])
    expect(formatPlan(plan)).toContain('plan: true')
  })

  it('skips LLM stages with --skip-llm', () => {
    const plan = planPipeline(
      defaultConfig({
        repos: ['owner/repo'],
        skipLlm: true,
      }),
    )
    expect(plan.stages).toEqual(['fetch', 'sample'])
    expect(plan.llmStages).toEqual([])
    expect(formatPlan(plan)).toContain('skip LLM: true')
  })
})
