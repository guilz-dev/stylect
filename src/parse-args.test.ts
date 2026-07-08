import { homedir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { defaultConfig } from './config.js'
import { parseArgv } from './parse-args.js'
import { formatPlan, planPipeline } from './pipeline/run.js'

describe('parseArgv', () => {
  it('parses run with repo and author', () => {
    const parsed = parseArgv([
      'run',
      '--repo',
      'owner/repo',
      '--author',
      'dev-user',
      '--plan',
    ])
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

  it('requires --repo for run', () => {
    expect(() => parseArgv(['run', '--plan'])).toThrow(/requires at least one --repo/)
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
