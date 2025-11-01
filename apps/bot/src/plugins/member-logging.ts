import { colors, definePlugin, Embed, isTextableGuildChannel } from '#framework'
import { Member } from 'oceanic.js'
import { formatUserMention } from '../commands/moderation/utils'

export default definePlugin({
  name: 'member-logging',
  onLoad(client) {
    client.on('guildMemberAdd', async (member) => {
      try {
        const config = await client.prisma.config.findUnique({
          where: {
            guildId: BigInt(member.guildID)
          }
        })

        if (
          !config ||
          !config.logsEnabled ||
          !config.logMemberJoins ||
          !config.modules.includes('MODERATION')
        ) {
          return
        }

        const channelId = config.memberJoinChannel?.toString() ||
          config.logsChannel?.toString()

        if (!channelId) {
          return
        }

        const guild = client.guilds.get(member.guildID)
        const channel = guild?.channels.get(channelId)

        if (!channel || !isTextableGuildChannel(channel)) {
          return
        }

        const accountAge = Date.now() - member.user.createdAt.getTime()
        const accountAgeDays = Math.floor(accountAge / (1000 * 60 * 60 * 24))
        const newAccountThreshold = config.newAccountThresholdDays ?? 7
        const isNewAccount = accountAgeDays < newAccountThreshold

        const embed = new Embed()
          .setTitle('👋 Member Joined')
          .setColor(isNewAccount ? colors.YELLOW : colors.GREEN)
          .addField('User', formatUserMention(member.user), true)
          .addField('User ID', member.user.id, true)
          .addField(
            'Account Created',
            `<t:${Math.floor(member.user.createdAt.getTime() / 1000)}:R>`,
            true
          )
          .addField('Account Age', `${accountAgeDays} days`, true)
          .addField('Member Count', (guild?.memberCount ?? 0).toString(), true)
          .setThumbnail(member.user.avatarURL())
          .setTimestamp()

        if (isNewAccount) {
          embed.addField(
            '⚠️ New Account',
            `This account is less than ${newAccountThreshold} days old`,
            false
          )
        }

        await channel.createMessage({ embeds: [embed] })
      } catch (error) {
        console.error('Failed to log member join:', error)
      }
    })

    client.on('guildMemberRemove', async (member) => {
      if (!(member instanceof Member)) return

      try {
        const config = await client.prisma.config.findUnique({
          where: {
            guildId: BigInt(member.guildID)
          }
        })

        if (
          !config ||
          !config.logsEnabled ||
          !config.logMemberLeaves ||
          !config.modules.includes('MODERATION')
        ) {
          return
        }

        const channelId = config.memberLeaveChannel?.toString() ||
          config.logsChannel?.toString()

        if (!channelId) {
          return
        }

        const guild = client.guilds.get(member.guildID)
        const channel = guild?.channels.get(channelId)

        if (!channel || !isTextableGuildChannel(channel)) {
          return
        }

        const joinedAt = member.joinedAt
          ? Math.floor(member.joinedAt.getTime() / 1000)
          : null

        const embed = new Embed()
          .setTitle('👋 Member Left')
          .setColor(colors.RED)
          .addField('User', formatUserMention(member.user), true)
          .addField('User ID', member.user.id, true)
          .addField('Member Count', (guild?.memberCount ?? 0).toString(), true)
          .setThumbnail(member.user.avatarURL())
          .setTimestamp()

        if (joinedAt) {
          embed.addField('Joined Server', `<t:${joinedAt}:R>`, true)
        }

        if (member.roles.length > 0) {
          const roles = member.roles
            .map((roleId) => `<@&${roleId}>`)
            .join(', ')
          embed.addField(
            'Roles',
            roles.length > 1024 ? `${roles.substring(0, 1021)}...` : roles,
            false
          )
        }

        await channel.createMessage({ embeds: [embed] })
      } catch (error) {
        console.error('Failed to log member leave:', error)
      }
    })
  }
})
