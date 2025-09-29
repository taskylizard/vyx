import { defineInteraction } from '#framework'
import { MessageFlags, ThreadChannel } from 'oceanic.js'

export default defineInteraction({
  id: 'resolved',
  type: 'button',
  async run(interaction) {
    await interaction.deferUpdate()
    const thread = interaction.channel
    if (thread && thread instanceof ThreadChannel) {
      await thread.edit({ locked: true, archived: true })
    }
    await interaction.createFollowup({
      content: 'This thread has been resolved and archived. Thank you!',
      flags: MessageFlags.EPHEMERAL
    })
  }
})
