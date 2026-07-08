import { homedir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { defaultConfig } from './config.js'
import { parseArgv } from './parse-args.js'
import { formatPlan, planPipeline } from './pipeline/run.js'

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

  it('parses --skip-llm', () => {
    const parsed = parseArgv(['run', '--repo', 'owner/repo', '--skip-llm'])
    expect(parsed.config.skipLlm).toBe(true)
  })

  it('parses --model', () => {
    const parsed = parseArgv(['run', '--repo', 'owner/repo', '--model', 'composer-2.5'])
    expect(parsed.config.model).toBe('composer-2.5')
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
