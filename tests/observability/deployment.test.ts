import { expect, test } from 'vite-plus/test'
import { resolveDeploymentVersion } from '../../src/observability/deployment.ts'

const sha = '0123456789abcdef0123456789abcdef01234567'

test('prefers and normalizes the configured deployment SHA', () => {
  expect(
    resolveDeploymentVersion({
      GITHUB_SHA: 'f'.repeat(40),
      KANIKOU_DEPLOYMENT_SHA: sha.toUpperCase()
    })
  ).toBe(sha)
})

test('accepts recognized build-provider commit SHAs', () => {
  expect(resolveDeploymentVersion({ GITHUB_SHA: sha })).toBe(sha)
  expect(resolveDeploymentVersion({ SOURCE_VERSION: sha })).toBe(sha)
})

test.each([
  '',
  ' ',
  'not-a-sha',
  'a'.repeat(39),
  'a'.repeat(41),
  'g'.repeat(40),
  '💥'.repeat(40),
  'a'.repeat(4096)
])('rejects malformed configured deployment identity %#', (candidate) => {
  expect(() =>
    resolveDeploymentVersion(
      { KANIKOU_DEPLOYMENT_SHA: candidate },
      '/definitely-missing-kanikou-checkout'
    )
  ).toThrow('must be a full hexadecimal Git commit SHA')
})

test('falls back to the package version outside a Git checkout', () => {
  expect(resolveDeploymentVersion({}, '/definitely-missing-kanikou-checkout')).toBe('0.0.0')
})
