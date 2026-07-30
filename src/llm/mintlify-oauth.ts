import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type {
  OAuthAuthorizationServerInformation,
  OAuthClientInformation,
  OAuthClientMetadata,
  OAuthClientProvider,
  OAuthTokens
} from '@ai-sdk/mcp'
import { z } from 'zod'

const OAuthTokensSchema = z.object({
  access_token: z.string(),
  authorization_server: z.url().optional(),
  expires_in: z.number().optional(),
  id_token: z.string().optional(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
  token_endpoint: z.url().optional(),
  token_type: z.string()
})

const OAuthCredentialsSchema = z.object({
  authorizationServerInformation: z.object({
    authorizationServerUrl: z.url(),
    tokenEndpoint: z.url()
  }),
  clientInformation: z.object({
    authorization_server: z.url().optional(),
    client_id: z.string(),
    client_id_issued_at: z.number().optional(),
    client_secret: z.string().optional(),
    client_secret_expires_at: z.number().optional(),
    token_endpoint: z.url().optional()
  }),
  clientMetadata: z.object({
    client_name: z.string().optional(),
    grant_types: z.array(z.string()).optional(),
    redirect_uris: z.array(z.url()),
    response_types: z.array(z.string()).optional(),
    scope: z.string().optional(),
    token_endpoint_auth_method: z.string().optional()
  }),
  codeVerifier: z.string().optional(),
  redirectUrl: z.url(),
  tokens: OAuthTokensSchema.optional()
})

type OAuthCredentials = z.infer<typeof OAuthCredentialsSchema>

export class MintlifyFileOAuthProvider implements OAuthClientProvider {
  readonly #filePath: string
  #credentials: OAuthCredentials

  constructor(filePath: string) {
    this.#filePath = path.resolve(filePath)
    const storedCredentials: unknown = JSON.parse(readFileSync(this.#filePath, 'utf8'))
    this.#credentials = OAuthCredentialsSchema.parse(storedCredentials)
  }

  get clientMetadata(): OAuthClientMetadata {
    return this.#credentials.clientMetadata
  }

  get redirectUrl(): string {
    return this.#credentials.redirectUrl
  }

  authorizationServerInformation(): OAuthAuthorizationServerInformation {
    return this.#credentials.authorizationServerInformation
  }

  clientInformation(): OAuthClientInformation {
    return this.#credentials.clientInformation
  }

  codeVerifier(): string {
    const codeVerifier = this.#credentials.codeVerifier
    if (codeVerifier === undefined) {
      throw new Error(
        'Mintlify OAuth has no stored PKCE verifier. Run mintlify-mcp-oauth.js again.'
      )
    }
    return codeVerifier
  }

  invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier'): void {
    if (scope === 'all' || scope === 'tokens') {
      this.#credentials.tokens = undefined
      this.#save()
    }
  }

  redirectToAuthorization(): never {
    throw new Error(
      'Mintlify OAuth credentials expired or were revoked. Run mintlify-mcp-oauth.js again and replace the credential file.'
    )
  }

  saveAuthorizationServerInformation(
    authorizationServerInformation: OAuthAuthorizationServerInformation
  ): void {
    this.#credentials.authorizationServerInformation = authorizationServerInformation
    this.#credentials.clientInformation.authorization_server =
      authorizationServerInformation.authorizationServerUrl
    this.#credentials.clientInformation.token_endpoint =
      authorizationServerInformation.tokenEndpoint
    this.#save()
  }

  saveCodeVerifier(codeVerifier: string): void {
    this.#credentials.codeVerifier = codeVerifier
    this.#save()
  }

  saveTokens(tokens: OAuthTokens): void {
    this.#credentials.tokens = tokens
    this.#save()
  }

  tokens(): OAuthTokens | undefined {
    return this.#credentials.tokens
  }

  validateAuthorizationServerURL(_serverUrl: string | URL, authorizationServerUrl: string | URL) {
    if (new URL(authorizationServerUrl).origin !== 'https://mcp.mintlify.com') {
      throw new Error(
        `Unexpected Mintlify authorization server: ${authorizationServerUrl.toString()}`
      )
    }
  }

  #save(): void {
    const temporaryPath = `${this.#filePath}.tmp`
    writeFileSync(temporaryPath, `${JSON.stringify(this.#credentials, null, 2)}\n`, {
      mode: 0o600
    })
    renameSync(temporaryPath, this.#filePath)
  }
}
