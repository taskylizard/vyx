import { match, P } from 'ts-pattern'
import { LastFmError } from './lastfm.ts'
import { JumbleImageError } from './renderer.ts'
import { JumbleError } from './service.ts'

export function jumbleErrorMessage(error: unknown, fallback: string): string {
  return match(error)
    .returnType<string>()
    .with(P.instanceOf(JumbleError), (value) => value.message)
    .with(P.instanceOf(LastFmError), (value) =>
      match(value.code)
        .with('invalid-username', 'empty-results', () => value.message)
        .with('missing-api-key', () => 'Jumble is not configured for Last.fm yet.')
        .otherwise(() => 'Last.fm is unavailable right now. Try again.')
    )
    .with(P.instanceOf(JumbleImageError), () => 'The cover art could not be rendered. Try again.')
    .otherwise(() => fallback)
}
