import { slashSub } from '../bot/rosepack.ts'
import { guildOnlyGuard } from '../discord/guards.ts'
import { buildJumbleProfileMessage } from '../jumble/profile-presentation.ts'

export default slashSub({
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
        : await context.app.jumble.service.setProfile(
            context.interaction.user.id,
            context.options.username
          )
    const summary = await context.app.jumble.service.profileSummary(context.interaction.user.id)
    await context.editResponse(buildJumbleProfileMessage(summary, savedUsername))
  }
})
