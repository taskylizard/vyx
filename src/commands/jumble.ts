import { slash } from '../bot/rosepack.ts'
import { match } from 'ts-pattern'
import { renderJumble } from '../jumble/discord.ts'
import { jumbleErrorMessage } from '../jumble/errors.ts'
import { componentIds } from '../jumble/components.ts'
import { jumblePlayGuards } from '../jumble/guards.ts'
import { buildJumbleProfileMessage } from '../jumble/profile-presentation.ts'
import { guildOnlyGuard } from '../discord/guards.ts'
import { modules } from '../modules.ts'

export default slash({
  name: 'jumble',
  description: 'Play a combined text-and-pixel-art music jumble',
  module: modules.jumble,
  contexts: ['guild'],
  installations: ['guild'],
  async onError(context, error) {
    context.app.logger.error('jumble command failed', { error })
    await context.editResponse(jumbleErrorMessage(error, 'Could not start Jumble. Try again.'))
  },
  subcommands: {
    play: slash({
      description: 'Guess a scrambled artist, album, or track from its name and artwork',
      guards: jumblePlayGuards,
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
          description: 'Last.fm username for this game (uses your saved profile when omitted)',
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
    profile: slash({
      description: 'View or set your Last.fm profile and Jumble stats',
      guards: [guildOnlyGuard],
      options: {
        username: {
          description: 'Set a Last.fm username (omit to view your profile)',
          kind: 'string',
          maxLength: 64,
          minLength: 1
        }
      },
      async execute(context) {
        await context.defer({ ephemeral: true })
        const savedUsername =
          context.options.username === undefined
            ? undefined
            : await context.app.jumble.setProfile(
                context.interaction.user.id,
                context.options.username
              )
        const summary = await context.app.jumble.profileSummary(context.interaction.user.id)
        await context.editResponse(buildJumbleProfileMessage(summary, savedUsername))
      }
    })
  }
})
