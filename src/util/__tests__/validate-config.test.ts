import { afterEach, describe, expect, it } from 'vitest'

import { defaultConfig } from '../../config.js'
import { cleanupTempDirs, createTempGitRepo } from '../../test-helpers/git-repo.js'
import { needsGitHubToken, validateRunConfig } from '../validate-config.js'

afterEach(() => {
  cleanupTempDirs()
})

describe('validateRunConfig', () => {
  it('requires a local clone for each repo in local mode', () => {
    expect(() =>
      validateRunConfig(
        defaultConfig({
          repos: ['owner/repo'],
          source: 'local',
        }),
      ),
    ).toThrow(/No local clone found/)
  })

  it('allows auto mode without local clones', () => {
    expect(() =>
      validateRunConfig(
        defaultConfig({
          repos: ['owner/repo'],
          source: 'auto',
        }),
      ),
    ).not.toThrow()
  })

  it('allows plan mode without local clones', () => {
    expect(() =>
      validateRunConfig(
        defaultConfig({
          repos: ['owner/repo'],
          source: 'local',
          plan: true,
        }),
      ),
    ).not.toThrow()
  })

  it('rejects extra repo-path values', () => {
    expect(() =>
      validateRunConfig(
        defaultConfig({
          repos: ['owner/repo'],
          repoPaths: ['/tmp/a', '/tmp/b'],
          source: 'local',
        }),
      ),
    ).toThrow(/More --repo-path values than --repo values/)
  })
})

describe('needsGitHubToken', () => {
  it('is true for github source', () => {
    expect(needsGitHubToken(defaultConfig({ source: 'github', repos: ['owner/repo'] }))).toBe(true)
  })

  it('is true for auto when any repo lacks a local clone', () => {
    expect(needsGitHubToken(defaultConfig({ source: 'auto', repos: ['owner/repo'] }))).toBe(true)
  })

  it('is false for local source when clone exists via repo-path', () => {
    const repoPath = createTempGitRepo('stylect-validate-', 'dev')
    expect(
      needsGitHubToken(
        defaultConfig({
          source: 'local',
          repos: ['owner/repo'],
          repoPaths: [repoPath],
        }),
      ),
    ).toBe(false)
  })
})
