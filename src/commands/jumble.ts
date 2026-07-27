import { slash, slashSub } from '../bot/rosepack.ts'
import { match, P } from 'ts-pattern'
import { JumbleError } from '../jumble/service.ts'
import { jumblePermissionError, renderJumble } from '../jumble/discord.ts'
import { JumbleImageError } from '../jumble/renderer.ts'
import { LastFmError } from '../jumble/lastfm.ts'
import { componentIds } from '../jumble/components.ts'
import { modules } from '../modules.ts'
import jumbleProfileSubcommand from './jumble-profile.ts'
import jumbleStatsSubcommand from './jumble-stats.ts'

export default slash({
  name: 'jumble',
  description: 'Play a combined text-and-pixel-art music jumble',
  module: modules.jumble,
  contexts: ['guild'],
  installations: ['guild'],
  async onError(context, error) {
    context.app.logger.error('jumble command failed', { error })
    await context.editResponse(errorMessage(error))
  },
  subcommands: {
    play: slashSub({
      description: 'Guess a scrambled artist, album, or track from its name and artwork',
      options: {
        kind: {
          description: 'Choose whether to guess an artist, album, or track',
          kind: 'string',
          choices: [
            { name: 'Artist (text + pixel art)', value: 'artist' },
            { name: 'Album (text + pixel art)', value: 'album' },
            { name: 'Track / song (text + pixel art)', value: 'track' }
          ]
        },
        username: {
          description: 'Last.fm username (uses your saved profile when omitted)',
          kind: 'string',
          maxLength: 64
        }
      },
      async execute(context) {
        await context.defer()
        const { username } = context.options
        const requestedKind = context.options.kind ?? 'album'
        const kind = match(requestedKind)
          .with('artist', 'album', 'track', (value) => value)
          .otherwise(() => undefined)
        if (kind === undefined) {
          await context.editResponse('That Jumble type is not available.')
          return
        }
        const permissionError = jumblePermissionError(context.interaction)
        if (permissionError !== null) {
          await context.editResponse(permissionError)
          return
        }
        if (username !== undefined)
          await context.app.jumble.setProfile(context.interaction.user.id, username)
        const result = await context.app.jumble.start({
          starterUserId: context.interaction.user.id,
          guildId: context.interaction.guildID,
          channelId: context.interaction.channelID,
          kind,
          username
        })
        const rendered = await renderJumble(
          result.state,
          context.app.jumbleRenderer,
          componentIds(result.state.session.id),
          result.action
        )
        if (rendered.imageError !== undefined) {
          context.app.logger.warn('jumble image could not be rendered', {
            error: rendered.imageError
          })
        }
        await context.editResponse(rendered.payload)
        try {
          const original = await context.interaction.getOriginal()
          await context.app.jumble.attachMessage(result.state.session.id, original.id)
        } catch (error) {
          context.app.logger.warn('jumble message ID could not be saved', { error })
        }
      }
    }),
    profile: jumbleProfileSubcommand,
    stats: jumbleStatsSubcommand
  }
})

function errorMessage(error: unknown): string {
  return match(error)
    .with(P.instanceOf(JumbleError), (value) => value.message)
    .with(P.instanceOf(LastFmError), (value) => value.message)
    .with(P.instanceOf(JumbleImageError), (value) => value.message)
    .otherwise(() => 'The Jumble could not be started. Please try again.')
}
