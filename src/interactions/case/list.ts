import { ActionRow, Button } from '@oceanicjs/builders';
import {
  ButtonStyles,
  type EditInteractionContent,
  type MessageActionRow
} from 'oceanic.js';
import { Embed, defineInteraction, splitArray } from '#framework';

export default defineInteraction({
  id: 'action.cases.list',
  type: 'modal',
  async run(interaction, client) {
    await interaction.defer();

    const [user, _page] = interaction.data.customID.split('.') ?? [];
    const page = Number(_page ?? '0');

    const member = interaction.guild?.members.get(user);

    if (!member) {
      return await interaction.editOriginal({
        content: 'Could not find case for that user.'
      });
    }

    const cases = await client.modules.cases.getMany(
      interaction.guildID!,
      member.user
    );
    const chunk = splitArray(cases, 10);

    const embed = new Embed()
      .setTitle(`Cases for ${member.user.tag}`)
      .setThumbnail(member.avatarURL());

    const replyOptions: EditInteractionContent = {
      embeds: [embed]
    };

    if (!cases.length) {
      return interaction.editOriginal({
        content: 'No cases were found for this user.'
      });
    }

    const componentPage = page > chunk.length ? page - 1 : page;
    const chunkPage = componentPage;

    chunk[chunkPage].forEach((caseData) => {
      embed.addFields([
        {
          name: `#${caseData.caseId} (${caseData.type.toUpperCase()}) <t:${caseData.createdAt / 1000n}:R>`,
          value: caseData.reason
        }
      ]);
    });

    if (chunk.length > 1) {
      const backButton = new Button(
        ButtonStyles.PRIMARY,
        `action.cases.list-${interaction.user.id}.${member.id}.${page - 1}`
      ).setLabel('Back');
      const nextButton = new Button(
        ButtonStyles.PRIMARY,
        `action.cases.list-${interaction.user.id}.${member.id}.${page + 1}`
      ).setLabel('Next');

      page === 0 && backButton.disable();
      page + 1 === chunk.length && nextButton.disable();
      const row = new ActionRow()
        .addComponents(backButton, nextButton)
        .toJSON() as MessageActionRow;

      replyOptions.components = [row];
    }

    return await interaction.editOriginal(replyOptions);
  }
});
