import {
  ApplicationIntegrationTypes,
  InteractionContextTypes,
  type User
} from 'oceanic.js'
import { Embed, defineUserCommand } from '#framework'

export default defineUserCommand({
  name: 'View User Avatar',
  integrationTypes: [
    ApplicationIntegrationTypes.USER_INSTALL,
    ApplicationIntegrationTypes.GUILD_INSTALL
  ],
  contexts: [
    InteractionContextTypes.GUILD,
    InteractionContextTypes.BOT_DM,
    InteractionContextTypes.PRIVATE_CHANNEL
  ],
  async run(interaction) {
    const user = <User>interaction.data.target
    const embed = new Embed().setImage(user.avatarURL())

    await interaction.reply({ embeds: [embed] })
  }
})
