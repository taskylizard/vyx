import { ButtonStyles, ComponentTypes, type TextChannel } from 'oceanic.js';
import { Embed, defineInteraction } from '#framework';

export default defineInteraction({
  id: 'action.report.create',
  type: 'modal',
  async run(interaction, client) {
    if (
      !interaction.member ||
      !interaction.guildID ||
      !interaction.isModalSubmitInteraction()
    )
      return;
    await interaction.defer(64);

    const existingReport = await client.prisma.report.findFirst({
      where: {
        guildId: BigInt(interaction.guildID),
        createdMember: BigInt(interaction.member.id),
        status: 'OPEN'
      }
    });

    if (existingReport) {
      return await interaction.editOriginal({
        content:
          'You already have an open report. Please wait for it to be resolved.'
      });
    }

    const config = await client.prisma.config.findUnique({
      where: {
        guildId: BigInt(interaction.guildID)
      }
    });

    if (!config?.reportsChannel) {
      return await interaction.editOriginal({
        content: 'This server does not have a report panel set up.'
      });
    }

    const reportChannel = interaction.guild?.channels.get(
      config.reportsChannel.toString()
    ) as TextChannel | undefined;

    if (!reportChannel) {
      return await interaction.editOriginal({
        content: 'This server does not have a report panel set up.'
      });
    }

    const reason = interaction.data.components.getTextInput('reason', true);
    const reportMemberId = interaction.data.customID.split('-')[1].trim();
    const reportedMember =
      interaction.guild!.members.get(reportMemberId) ??
      (await client.rest.guilds.getMember(interaction.guildID, reportMemberId));

    if (!reportedMember) {
      return await interaction.editOriginal({
        content: 'The user you mentioned is not in this server.'
      });
    }
    const [fetchedId] = await client.prisma.report.findMany({
      where: { guildId: BigInt(interaction.guildID) },
      orderBy: { reportId: 'desc' },
      take: 1
    });

    const id = fetchedId?.reportId ?? 0;

    const report = await client.prisma.report.create({
      data: {
        reportId: String(Number(id) + 1),
        guildId: BigInt(interaction.guildID),
        createdMember: BigInt(interaction.member.id),
        reportedMember: BigInt(reportedMember?.id),
        reason: reason
      }
    });

    const embed = new Embed()
      .setTitle(`Report from ${interaction.member.username}`)
      .setDescription(`**Reason**\n${reason}`)
      .addFields([
        {
          name: 'Reported Member',
          value: `${reportedMember.username} (${reportedMember.mention})`
        },
        {
          name: 'Submitted By',
          value: `${interaction.member.username} (${interaction.member.mention})`
        }
      ])
      .setTimestamp(new Date().toISOString())
      .setFooter({
        text: `Report ID: ${report.reportId}`
      });

    await reportChannel.createMessage({
      embeds: [embed],
      components: [
        {
          type: ComponentTypes.ACTION_ROW,
          components: [
            {
              type: ComponentTypes.BUTTON,
              label: 'Mark as Resolved',
              style: ButtonStyles.SUCCESS,
              customID: `action.report.resolve-${report.reportId}`
            }
          ]
        }
      ]
    });

    return await interaction.reply({ content: 'Reported that user.' });
  }
});
