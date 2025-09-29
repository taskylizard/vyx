import { defineCommand, useModals } from '../../../src'

export default defineCommand(
  {
    description: 'Test the bot',
    preconditions: ['ownerOnly']
  },
  async (interaction) => {
    const { form } = useModals()

    await interaction.createModal(form!)
  }
)
