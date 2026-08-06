import { execFileSync } from 'node:child_process'
import packageMetadata from '../../package.json' with { type: 'json' }

const fullGitShaPattern = /^(?:[\da-f]{40}|[\da-f]{64})$/iu

export function resolveDeploymentVersion(
  environment: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd()
): string {
  const configuredSha = environment.KANIKOU_DEPLOYMENT_SHA
  if (configuredSha !== undefined) {
    return parseDeploymentSha('KANIKOU_DEPLOYMENT_SHA', configuredSha)
  }

  for (const variable of ['GITHUB_SHA', 'SOURCE_VERSION'] as const) {
    const candidate = environment[variable]
    if (candidate !== undefined && fullGitShaPattern.test(candidate.trim())) {
      return candidate.trim().toLowerCase()
    }
  }

  try {
    const gitSha = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1000
    })
    return parseDeploymentSha('git rev-parse HEAD', gitSha)
  } catch {
    return packageMetadata.version
  }
}

function parseDeploymentSha(source: string, value: string): string {
  const normalized = value.trim().toLowerCase()
  if (!fullGitShaPattern.test(normalized)) {
    throw new Error(`${source} must be a full hexadecimal Git commit SHA.`)
  }
  return normalized
}
