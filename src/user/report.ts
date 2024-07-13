import { ComponentTypes, Constants, TextInputStyles } from 'oceanic.js';
import { defineUserCommand } from '#framework';

export default defineUserCommand({
  name: 'Report this member',
  contexts: [Constants.InteractionContextTypes.GUILD],
  async run(interaction) {
    if (!interaction.guildID || !interaction.member) {
      return await interaction.reply({
        content: 'This command can only be used inside servers.',
        flags: 64
      });
    }

    const member = interaction.data.resolved.members.first();
    if (!member) {
      return await interaction.reply({
        content: 'Please mention a user to report.',
        flags: 64
      });
    }

    await interaction.createModal({
      title: 'Report Member',
      customID: `action.report.create-${member.id}`,
      components: [
        {
          type: ComponentTypes.ACTION_ROW,
          components: [
            {
              label: 'Reason',
              type: ComponentTypes.TEXT_INPUT,
              style: TextInputStyles.PARAGRAPH,
              customID: 'reason',
              placeholder: 'Enter a reason for this report.',
              required: true
            }
          ]
        }
      ]
    });
  }
});
