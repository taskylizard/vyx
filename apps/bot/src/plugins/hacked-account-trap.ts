import { colors, definePlugin, Embed } from '#framework'
import ms from 'ms'
import type { Message, TextChannel } from 'oceanic.js'
import { formatUserMention } from '../commands/moderation/utils'

export default definePlugin({
  name: 'hacked-account-trap',
  onLoad(client) {
    client.on('messageCreate', async (message: Message) => {
      if (!message.guildID || message.author.bot) return

      try {
        const config = await client.prisma.config.findUnique({
          where: {
            guildId: BigInt(message.guildID)
          }
        })

        if (
          !config ||
          !config.trapChannel ||
          !config.modules.includes('MODERATION')
        ) {
          return
        }

        if (message.channelID !== config.trapChannel.toString()) {
          return
        }

        const guild = client.guilds.get(message.guildID)
        if (!guild) return

        const member = guild.members.get(message.author.id)
        if (!member) return

        const action = config.trapAction || 'SOFTBAN'
        const duration = config.trapDuration

        let actionTaken = false
        let actionDescription = ''
        let reason = 'Posted in trap channel (potential hacked account)'

        try {
          switch (action) {
            case 'BAN':
              await member.ban({ reason })
              actionTaken = true
              actionDescription = 'Banned'
              break

            case 'KICK':
              await member.kick(reason)
              actionTaken = true
              actionDescription = 'Kicked'
              break

            case 'SOFTBAN': {
              await member.ban({ reason, deleteMessageSeconds: 86400 })
              await guild.removeBan(member.id, 'Softban - unbanning')
              actionTaken = true
              actionDescription = 'Softbanned'
              break
            }

            case 'TIMEOUT': {
              if (!duration) {
                console.warn('Timeout action requires duration')
                return
              }

              const durationMs = ms(duration)
              if (typeof durationMs !== 'number' || durationMs <= 0) {
                console.warn(`Invalid duration format: ${duration}`)
                return
              }

              await member.edit({
                communicationDisabledUntil: new Date(
                  Date.now() + durationMs
                ).toISOString()
              })
              actionTaken = true
              actionDescription = `Timed out for ${duration}`
              break
            }

            default:
              console.warn(`Unknown trap action: ${action}`)
              return
          }
        } catch (error) {
          console.error('Failed to execute trap action:', error)
          actionDescription = `Failed to ${action.toLowerCase()}`
        }

        if (actionTaken) {
          try {
            await message.delete()
          } catch (error) {
            console.error('Failed to delete trap message:', error)
          }

          const channelId = config.moderationActionsChannel?.toString() ||
            config.logsChannel?.toString()

          if (channelId) {
            const logsChannel = guild.channels.get(channelId) as
              | TextChannel
              | undefined

            if (logsChannel) {
              const embed = new Embed()
                .setTitle('🪤 Hacked Account Trap Triggered')
                .setColor(colors.RED)
                .addField('User', formatUserMention(message.author), true)
                .addField('User ID', message.author.id, true)
                .addField('Channel', `<#${message.channelID}>`, true)
                .addField('Action Taken', actionDescription, true)
                .addField('Reason', reason, false)
                .setTimestamp()

              if (message.content) {
                embed.addField(
                  'Message Content',
                  message.content.length > 1024
                    ? `${message.content.substring(0, 1021)}...`
                    : message.content,
                  false
                )
              }

              await logsChannel.createMessage({ embeds: [embed] })
            }
          }
        }
      } catch (error) {
        console.error('Failed to process trap channel message:', error)
      }
    })
  }
})
