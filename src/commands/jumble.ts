import { slash, slashSub } from '../bot/rosepack.ts'
import { JumbleError } from '../jumble/service.ts'
import { jumblePermissionError, renderJumble } from '../jumble/discord.ts'
import { JumbleImageError } from '../jumble/renderer.ts'
import { JUMBLE_KINDS } from '../jumble/types.ts'
import { LastFmError } from '../jumble/lastfm.ts'
import { componentIds } from '../jumble/components.ts'
import jumbleProfileSubcommand from './jumble-profile.ts'
import jumbleStatsSubcommand from './jumble-stats.ts'

export default slash({
  name: 'jumble',
  description: 'Play a combined text-and-pixel-art music jumble',
  contexts: ['guild', 'botDm', 'privateChannel'],
  installations: ['guild', 'user'],
  async onError(context, error) {
    context.app.logger.warn('jumble command failed', error)
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
        const kind = context.options.kind ?? 'album'
        if (!JUMBLE_KINDS.includes(kind)) {
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
          context.app.logger.warn('jumble image could not be rendered', rendered.imageError)
        }
        await context.editResponse(rendered.payload)
        try {
          const original = await context.interaction.getOriginal()
          await context.app.jumble.attachMessage(result.state.session.id, original.id)
        } catch (error) {
          context.app.logger.warn('jumble message ID could not be saved', error)
        }
      }
    }),
    profile: jumbleProfileSubcommand,
    stats: jumbleStatsSubcommand
  }
})

function errorMessage(error: unknown): string {
  if (
    error instanceof JumbleError ||
    error instanceof LastFmError ||
    error instanceof JumbleImageError
  ) {
    return error.message
  }
  return 'The Jumble could not be started. Please try again.'
}
