import type { JumbleTimingSink } from './timing.ts'
import { addActiveSpanEvent, traceOperation } from '../observability/tracing.ts'
import type { KanikouLogger } from '../observability/types.ts'
import { componentIds } from './components.ts'
import { renderJumble } from './discord.ts'
import { safeEditMessage } from '../discord/safe-actions.ts'
import { LastFmClient, MissingLastFmProvider } from './lastfm.ts'
import { DiscogsClient } from './discogs.ts'
import { DeezerClient } from './deezer.ts'
import { JumbleMetadataCache } from './metadata-cache.ts'
import { JumbleLibrary } from './library.ts'
import { MusicBrainzClient } from './musicbrainz.ts'
import { JumbleImageRenderer } from './renderer.ts'
import { JumbleRepository } from './repository.ts'
import { JumbleService } from './service.ts'
import type { KanikouEnv } from '../config/env.ts'
import type { KanikouDatabase } from '../database/database.ts'
import type { Client } from 'oceanic.js'
import { match } from 'ts-pattern'

export interface Jumble {
  service: JumbleService
  renderer: JumbleImageRenderer
  metadataCache: JumbleMetadataCache
}

export function createJumble(
  config: KanikouEnv,
  database: KanikouDatabase,
  client: Client,
  logger: KanikouLogger
): Jumble {
  const jumbleMetadataCache = new JumbleMetadataCache(database.db, {
    onError: (error) => logger.warn('jumble metadata cache error', { error })
  })
  const onTiming: JumbleTimingSink = (event) => {
    logger.info('jumble timing', { ...event })
    addActiveSpanEvent(`jumble.${event.type}`, { ...event })
  }
  const musicBrainz = new MusicBrainzClient({
    cache: jumbleMetadataCache,
    onError: (error) => logger.warn('MusicBrainz enrichment error', { error })
  })
  const discogs = new DiscogsClient({
    token: config.DISCOGS_TOKEN,
    cache: jumbleMetadataCache,
    onError: (error) => logger.warn('Discogs enrichment error', { error })
  })
  const deezer = new DeezerClient({
    cache: jumbleMetadataCache,
    onError: (error) => logger.warn('Deezer enrichment error', { error })
  })
  const jumbleRenderer = new JumbleImageRenderer({ onTiming })
  const jumbleProvider = match(config.LASTFM_API_KEY)
    .with(undefined, () => new MissingLastFmProvider())
    .otherwise(
      (apiKey) =>
        new LastFmClient({
          apiKey,
          cache: jumbleMetadataCache,
          musicBrainz,
          discogs,
          deezer,
          onTiming,
          onError: (error) => logger.warn('Last.fm candidate cache error', { error })
        })
    )
  const jumbleRepository = new JumbleRepository(database.db)
  const jumbleLibrary = new JumbleLibrary(jumbleRepository, jumbleProvider, { onTiming })
  const jumble = new JumbleService(jumbleRepository, jumbleProvider, {
    library: jumbleLibrary,
    onTiming,
    onExpired: (state) =>
      traceOperation(
        'jumble.expired_message.update',
        {
          attributes: {
            'discord.channel.id': state.session.channelId,
            'jumble.session.id': state.session.id
          },
          parent: 'root'
        },
        async () => {
          if (state.session.messageId === null) return
          const rendered = await renderJumble(
            state,
            jumbleRenderer,
            componentIds(state.session.id),
            'expired'
          )
          if (rendered.imageError !== undefined) {
            logger.warn('expired jumble image could not be rendered', {
              error: rendered.imageError
            })
          }
          try {
            await safeEditMessage(
              client,
              state.session.channelId,
              state.session.messageId,
              rendered.payload
            )
          } catch (error) {
            logger.warn('expired jumble message could not be updated', { error })
          }
        }
      )
  })
  return { service: jumble, renderer: jumbleRenderer, metadataCache: jumbleMetadataCache }
}
