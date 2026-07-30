import { slashSub } from '../bot/rosepack.ts'
import { guildOnlyGuard } from '../discord/guards.ts'

export default slashSub({
  description: 'Set the Last.fm profile used by Jumble',
  guards: [guildOnlyGuard],
  options: {
    username: {
      description: 'Your Last.fm username',
      kind: 'string',
      maxLength: 64,
      minLength: 1,
      required: true
    }
  },
  async execute(context) {
    await context.defer({ ephemeral: true })
    const username = await context.app.jumble.setProfile(
      context.interaction.user.id,
      context.options.username
    )
    await context.editResponse(`Saved Last.fm profile \`${username.replaceAll('`', '')}\`.`)
  }
})
