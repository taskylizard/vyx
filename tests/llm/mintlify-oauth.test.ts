import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, test } from 'vite-plus/test'
import { MintlifyFileOAuthProvider } from '../../src/llm/mintlify-oauth.ts'

test('loads and persists refreshed Mintlify OAuth tokens', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'kanikou-mintlify-oauth-'))
  const filePath = path.join(directory, 'oauth.json')
  writeFileSync(
    filePath,
    JSON.stringify({
      authorizationServerInformation: {
        authorizationServerUrl: 'https://mcp.mintlify.com',
        tokenEndpoint: 'https://mcp.mintlify.com/oauth/token'
      },
      clientInformation: {
        authorization_server: 'https://mcp.mintlify.com',
        client_id: 'client-id',
        token_endpoint: 'https://mcp.mintlify.com/oauth/token'
      },
      clientMetadata: {
        redirect_uris: ['http://127.0.0.1:1234/oauth/mintlify/callback'],
        token_endpoint_auth_method: 'none'
      },
      redirectUrl: 'http://127.0.0.1:1234/oauth/mintlify/callback',
      tokens: {
        access_token: 'old-access-token',
        refresh_token: 'refresh-token',
        token_type: 'bearer'
      }
    })
  )

  try {
    const provider = new MintlifyFileOAuthProvider(filePath)
    expect(provider.tokens()?.access_token).toBe('old-access-token')

    provider.saveTokens({
      access_token: 'new-access-token',
      refresh_token: 'rotated-refresh-token',
      token_type: 'bearer'
    })
    provider.saveAuthorizationServerInformation({
      authorizationServerUrl: 'https://mcp.mintlify.com',
      tokenEndpoint: 'https://mcp.mintlify.com/oauth/token-v2'
    })
    provider.saveCodeVerifier('new-code-verifier')

    const saved = JSON.parse(readFileSync(filePath, 'utf8'))
    expect(saved.tokens).toMatchObject({
      access_token: 'new-access-token',
      refresh_token: 'rotated-refresh-token'
    })
    expect(saved.authorizationServerInformation.tokenEndpoint).toBe(
      'https://mcp.mintlify.com/oauth/token-v2'
    )
    expect(saved.clientInformation.token_endpoint).toBe('https://mcp.mintlify.com/oauth/token-v2')
    expect(provider.codeVerifier()).toBe('new-code-verifier')
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})
