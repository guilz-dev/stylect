import { defaultConfig, type StylectConfig } from './config.js'

export type ParsedCli = {
  command: 'help' | 'run' | 'version'
  config: StylectConfig
}

export function parseArgv(argv: string[]): ParsedCli {
  const [command, ...rest] = argv
  const config = defaultConfig()

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i]
    switch (token) {
      case '--author':
      case '-a':
        config.author = requireValue(rest, i, token)
        i += 1
        break
      case '--repo':
      case '-r':
        config.repos.push(requireValue(rest, i, token))
        i += 1
        break
      case '--repo-path':
        config.repoPaths.push(requireValue(rest, i, token))
        i += 1
        break
      case '--since':
        config.since = requireValue(rest, i, token)
        i += 1
        break
      case '--until':
        config.until = requireValue(rest, i, token)
        i += 1
        break
      case '--max-commits':
      case '-n':
        config.maxCommits = Number.parseInt(requireValue(rest, i, token), 10)
        i += 1
        break
      case '--samples':
      case '-s':
        config.samplesPerGroup = Number.parseInt(requireValue(rest, i, token), 10)
        i += 1
        break
      case '--output':
      case '-o':
        config.outputDir = requireValue(rest, i, token)
        i += 1
        break
      case '--cache':
        config.cacheDir = requireValue(rest, i, token)
        i += 1
        break
      case '--token':
      case '-t':
        config.githubToken = requireValue(rest, i, token)
        i += 1
        break
      case '--model':
        config.model = requireValue(rest, i, token)
        i += 1
        break
      case '--cursor-api-key':
        config.cursorApiKey = requireValue(rest, i, token)
        i += 1
        break
      case '--source':
        config.source = parseSource(requireValue(rest, i, token))
        i += 1
        break
      case '--plan':
        config.plan = true
        break
      case '--dry-run':
        config.plan = true
        config.dryRun = true
        break
      case '--fresh':
        config.fresh = true
        break
      case '--skip-llm':
        config.skipLlm = true
        break
      case '--help':
      case '-h':
        return { command: 'help', config }
      default:
        throw new Error(`Unknown argument: ${token}`)
    }
  }

  if (command === 'version' || command === '-v' || command === '--version') {
    return { command: 'version', config }
  }

  if (!command || command === 'help') {
    return { command: 'help', config }
  }

  if (command !== 'run') {
    throw new Error(`Unknown command: ${command}`)
  }

  if (config.repos.length === 0) {
    throw new Error('run requires at least one --repo owner/name')
  }

  return { command: 'run', config }
}

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1]
  if (!value) {
    throw new Error(`${flag} requires a value`)
  }
  return value
}

function parseSource(value: string): StylectConfig['source'] {
  if (value === 'auto' || value === 'local' || value === 'github') {
    return value
  }
  throw new Error(`Invalid --source value: ${value} (expected auto, local, or github)`)
}
