import { defineCommand, useActionRow, useSelectMenus } from '../../../src'

export default defineCommand(
  {
    description: 'NOOP!',
    dm: true
  },
  (interaction) => {
    const { choose } = useSelectMenus()
    const row = useActionRow(choose)

    interaction.reply({ content: 'Noop', components: [row] })
  }
)
