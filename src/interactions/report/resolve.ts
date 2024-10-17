import { Embed, defineInteraction } from '#framework'

export default defineInteraction({
  id: 'action.report.resolve',
  type: 'button',
  async run(interaction, client) {
    if (!interaction.member || !interaction.guildID) return
    await interaction.defer(64)

    const hasPermission = interaction.memberPermissions?.has('ADMINISTRATOR')

    if (!hasPermission) {
      return await interaction.editOriginal({
        content: "You don't have permission to run this command."
      })
    }

    const reportId = interaction.data.customID.split('-')[1]

    const report = await client.prisma.report.findUnique({
      where: {
        reportId_guildId: { guildId: BigInt(interaction.guildID), reportId }
      },
      select: {
        createdMember: true,
        guildId: true,
        reason: true,
        reportedMember: true
      }
    })

    if (!report) {
      return await interaction.editOriginal({
        content: 'This report does not exist.'
      })
    }

    const message = interaction.channel.messages.get(interaction.message.id)

    if (!message) {
      return await interaction.editOriginal({
        content: 'This message does not exist.'
      })
    }

    message.embeds.forEach((embed) => {
      embed.title += ' (Resolved)'
      embed.fields!.push({
        name: 'Resolved by',
        value: `${interaction.member.username} (${interaction.member.mention})`
      })
    })

    await message.edit({
      embeds: message.embeds,
      components: []
    })

    await client.prisma.report.update({
      where: {
        reportId_guildId: { guildId: BigInt(interaction.guildID), reportId }
      },
      data: {
        resolvedAt: new Date(),
        status: 'CLOSED'
      }
    })

    await interaction.editOriginal({
      content: 'This report has been marked as resolved.'
    })

    const server = await client.rest.guilds.get(String(report.guildId))
    const embed = new Embed()
      .setTitle('Your report has been marked resolved.')
      .setDescription(`**Reason**\n${report.reason}`)
      .addFields([
        {
          name: 'Reported Member',
          value: `<@${report.reportedMember}>`
        },
        {
          name: 'Server',
          value: server.name ?? 'Unknown :('
        }
      ])
      .setTimestamp(new Date().toISOString())
      .setFooter({
        text: `Report ID: ${reportId}`
      })

    try {
      const dm =
        client.privateChannels.find(
          (channel) => channel.recipient.id === String(report.createdMember)
        ) ?? (await client.rest.users.createDM(String(report.createdMember)))

      return await dm.createMessage({ embeds: [embed] })
    } catch (error) {
      // Simply no-op a bit
      return client.logger.error(error)
    }
  }
})
