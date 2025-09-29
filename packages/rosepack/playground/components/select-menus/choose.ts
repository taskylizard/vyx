import { defineSelectMenu, useEmbed } from '../../../src'

export default defineSelectMenu(
  {
    type: 'User',
    placeholder: 'Choose a user'
  },
  async (interaction, selected) => {
    const member = interaction.guild?.members.get(selected[0])
    const embed = useEmbed({
      color: '0x2c2d31',
      description: `You selected ${member?.user}!`
    }).toJSON()

    interaction.reply({ embeds: [embed] })
  }
)
