import { defineSlashCommand, Embed } from '#framework'
import { getMessages, smugshroom } from '@packages/inference-engine'

import { buildPromptContext, requestAskAI } from '#framework'
import type { Prisma } from '@packages/database'
import {
  ApplicationCommandOptionTypes,
  ApplicationIntegrationTypes,
  InteractionContextTypes
} from 'oceanic.js'

export default defineSlashCommand({
  name: 'ai',
  description: 'Generate text using AI.',
  contexts: [
    InteractionContextTypes.BOT_DM,
    InteractionContextTypes.GUILD,
    InteractionContextTypes.PRIVATE_CHANNEL
  ],
  integrationTypes: [
    ApplicationIntegrationTypes.USER_INSTALL,
    ApplicationIntegrationTypes.GUILD_INSTALL
  ],

  subcommands: [
    {
      name: 'chat',
      description: 'Chat with AI, ask it questions.',
      options: [
        {
          name: 'prompt',
          type: ApplicationCommandOptionTypes.STRING,
          description: 'Meaningful prompt, use quotes if necessary.',
          required: true
        },
        {
          name: 'ephemeral',
          type: ApplicationCommandOptionTypes.BOOLEAN,
          description:
            'Ephemeral, only visible to the user who ran the command.',
          required: false
        }
      ],
      cooldown: 5,
      async run(ctx) {
        const prompt = ctx.options.getString('prompt', true)
        const ephemeral = ctx.options.getBoolean('ephemeral', false)

        if (ephemeral) {
          await ctx.defer(64)
        }

        const loading = await Bun.fetch(
          'https://github.com/taskylizard/kanikou/blob/trunk/apps/bot/public/loading.gif?raw=true'
        )
        const response = await loading.arrayBuffer()
        const buffer = Buffer.from(response)

        const embed = new Embed()
          .setFooter({
            text:
              'Generative content may produce offensive results, use responsibly.'
          })
          .setAuthor({
            name: prompt,
            iconURL: ctx.user.avatarURL()
          })
          .setImage('attachment://loading.gif')

        await ctx.interaction.editOriginal({
          embeds: [embed],
          files: [
            {
              name: 'loading.gif',
              contents: buffer
            }
          ]
        })

        const context = buildPromptContext(ctx.client, [], prompt)
        const generation = await requestAskAI(
          ctx.client,
          context,
          'mention',
          ctx.user.id,
          ctx.interaction.guildID ?? undefined,
          ctx.user.username,
          ctx.guild?.name ?? undefined
        )

        if (!generation.ok) {
          const em = embed
            .setImage(null!)
            .setDescription(
              ':warning: Some error occurred while generating text. Please try again.'
            )
          return await ctx.interaction.editOriginal({
            embeds: [em],
            files: [],
            attachments: []
          })
        }

        const em = embed
          .setImage(null!)
          .setDescription(generation.text ?? 'No output')

        return await ctx.interaction.editOriginal({
          embeds: [em],
          files: [],
          attachments: []
        })
      }
    },
    {
      name: 'smugshroom',
      description: 'The cringe-inducing AI-powered summary generator.',
      cooldown: 10,
      async run(ctx) {
        const msg = await ctx.followUp({ content: 'Summarizing...' })
        const message = await msg.getMessage()
        const messages = await getMessages(ctx.interaction.channel as any, 25)

        if (typeof messages === 'undefined') {
          return await ctx.reply('No messages were found.')
        }

        const _summary = await smugshroom(messages)
        const removeQuotes = (text: string) => text.replace(/"([^"]*)"/g, '$1')
        const summary = removeQuotes(_summary)
        return await ctx.interaction.editFollowup(message.id, {
          content: summary
        })
      }
    },
    {
      name: 'whitelist',
      description: 'Manage AI whitelisted channels for this server.',
      options: [
        {
          name: 'channel',
          type: ApplicationCommandOptionTypes.CHANNEL,
          description: 'The channel to add or remove from whitelist.',
          required: true
        },
        {
          name: 'action',
          type: ApplicationCommandOptionTypes.STRING,
          description: 'Add or remove the channel.',
          required: true,
          choices: [
            { name: 'Add', value: 'add' },
            { name: 'Remove', value: 'remove' }
          ]
        }
      ],
      guildOnly: true,
      requiredPermissions: ['MANAGE_CHANNELS'],
      async run(ctx) {
        if (!ctx.guild) {
          return ctx.reply('This command can only be used in a server.')
        }
        if (!ctx.member?.permissions.has('MANAGE_CHANNELS')) {
          return ctx.reply(
            'You need Manage Channels permission to use this command.'
          )
        }
        const channel = ctx.options.getChannel('channel', true)
        const action = ctx.options.getString('action', true)
        const guildId = BigInt(ctx.guild.id)
        const channelId = BigInt(channel.id)
        const config = await ctx.client.prisma.config.findUnique({
          where: { guildId }
        })
        let whitelistedChannels = config?.aiWhitelistedChannels || []
        if (action === 'add') {
          if (!whitelistedChannels.includes(channelId)) {
            whitelistedChannels.push(channelId)
          }
        } else if (action === 'remove') {
          whitelistedChannels = whitelistedChannels.filter((id: bigint) =>
            id !== channelId
          )
        }
        await ctx.client.prisma.config.upsert({
          where: { guildId },
          update: {
            aiWhitelistedChannels: whitelistedChannels
          } as Prisma.ConfigUncheckedUpdateInput,
          create: {
            guildId,
            aiWhitelistedChannels: whitelistedChannels
          } as Prisma.ConfigUncheckedCreateInput
        })
        const updatedConfig = await ctx.client.prisma.config.findUnique({
          where: { guildId }
        })
        const list = (updatedConfig?.aiWhitelistedChannels as bigint[])?.map((
          id: bigint
        ) => `<#${String(id)}>`).join(', ') || 'None'
        await ctx.reply(
          `Channel ${channel.name} ${
            action === 'add' ? 'added to' : 'removed from'
          }  whitelist.\n\nCurrent whitelisted channels: ${list}`
        )
      }
    }
  ]
})
