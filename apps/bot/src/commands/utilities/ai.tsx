/** @jsx h */
/** @jsxFrag Fragment */
import { Client, defineSlashCommand, Embed } from '#framework'
import {
  generateImage,
  generateVelvetText,
  getMessages,
  smugshroom,
  textifyMessageForGPTModels
} from '@packages/inference-engine'

import { buildPromptContext, requestAskAI } from '#framework'
import {
  ActionRow,
  Button,
  ButtonStyles,
  ComponentMessage,
  Container,
  Separator,
  StringOption,
  StringSelect,
  TextDisplay
} from '@packages/components-jsx'
import { h } from '@packages/components-jsx/jsx-runtime'
import type { AITask, Prisma } from '@packages/database'
import {
  ApplicationCommandOptionTypes,
  ApplicationIntegrationTypes,
  ComponentTypes,
  InteractionContextTypes,
  SeparatorSpacingSize,
  type StringSelectMenu
} from 'oceanic.js'
import { imagetoimage } from '../../framework/utils/imagetoimage'

async function buildPersonalityContext(
  client: Client,
  userId: string
): Promise<string> {
  const config = await client.prisma.userAIConfig.findUnique({
    where: { userId }
  })

  if (!config) {
    return ''
  }

  const instructions: string[] = []

  if (config.customPrompt) {
    instructions.push(config.customPrompt)
  }

  const toneMap = {
    balanced: 'Use a balanced tone that is neither too casual nor too formal.',
    casual: 'Use a casual, relaxed tone as if talking to a friend.',
    professional: 'Use a professional, formal tone.',
    friendly: 'Use a warm, friendly, and approachable tone.',
    sarcastic: 'Use a lighthearted, slightly sarcastic tone with humor.'
  }
  const toneInstructions = toneMap[config.tone as keyof typeof toneMap] ||
    'Use a balanced tone.'

  const verbosityMap = {
    concise: 'Keep responses very brief and to the point (1-2 sentences).',
    normal: 'Provide moderately detailed responses.',
    detailed: 'Provide thorough, detailed responses with explanations.',
    comprehensive:
      'Provide very comprehensive responses with extensive details and examples.'
  }
  const verbosityInstructions =
    verbosityMap[config.verbosity as keyof typeof verbosityMap] ||
    'Provide moderately detailed responses.'

  const languageMap = {
    standard: 'Use standard, clear language.',
    informal: 'Use informal language and contractions.',
    'internet-speak': 'Use internet slang and casual online language.',
    formal: 'Use formal, grammatical language.'
  }
  const languageInstructions =
    languageMap[config.languageStyle as keyof typeof languageMap] ||
    'Use standard, clear language.'

  const formatMap = {
    mixed: 'Use a mix of text and code blocks as appropriate.',
    'code-first': 'Prefer code examples and technical details first.',
    'text-first': 'Lead with explanations before any code.',
    'markdown-heavy':
      'Use extensive Markdown formatting including headers, lists, and code blocks.'
  }
  const formatInstructions =
    formatMap[config.responseFormat as keyof typeof formatMap] ||
    'Use a mix of text and code blocks as appropriate.'

  instructions.push(toneInstructions)
  instructions.push(verbosityInstructions)
  instructions.push(languageInstructions)
  instructions.push(formatInstructions)

  if (config.personalityTags.length > 0) {
    const tagDescriptions: Record<string, string> = {
      humorous: 'Add appropriate humor and wit where suitable.',
      technical: 'Focus on technical accuracy and precision.',
      creative: 'Be creative and think outside the box.',
      empathetic: 'Show understanding and empathy.',
      witty: 'Use clever wordplay and wit.'
    }

    const activeTags = config.personalityTags
      .map((tag: string) => tagDescriptions[tag])
      .filter(Boolean)

    if (activeTags.length > 0) {
      instructions.push(activeTags.join(' '))
    }
  }

  if (config.excludedTopics.length > 0) {
    instructions.push(
      `Avoid discussing these topics: ${config.excludedTopics.join(', ')}.`
    )
  }

  return `Personality Instructions: ${instructions.join(' ')}`
}

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
      name: 'ask',
      description: 'Ask kanikou in one shot.',
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

        const personalityContext = await buildPersonalityContext(
          ctx.client,
          ctx.user.id
        )

        const context = buildPromptContext(
          ctx.client,
          [],
          personalityContext
            ? `${personalityContext}\n\nUser Question: ${prompt}`
            : prompt
        )
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
      name: 'image',
      description: 'Generate an image using AI.',
      options: [
        {
          name: 'prompt',
          type: ApplicationCommandOptionTypes.STRING,
          description: 'Description of the image to generate',
          required: true
        },
        {
          name: 'style',
          type: ApplicationCommandOptionTypes.STRING,
          description: 'Style of the image (optional)',
          required: false,
          choices: [
            { name: 'Realistic', value: 'realistic' },
            { name: 'Artistic', value: 'artistic' },
            { name: 'Cartoon', value: 'cartoon' },
            { name: 'Abstract', value: 'abstract' },
            { name: 'Portrait', value: 'portrait' }
          ]
        },
        {
          name: 'ephemeral',
          type: ApplicationCommandOptionTypes.BOOLEAN,
          description:
            'Ephemeral, only visible to the user who ran the command.',
          required: false
        }
      ],
      cooldown: 10,
      async run(ctx) {
        const prompt = ctx.options.getString('prompt', true)
        const style = ctx.options.getString('style', false)
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

        try {
          const result = await generateImage({
            app: 'kanikou',
            prompt,
            model: 'dream',
            style: style as any,
            userId: ctx.user.id,
            guildId: ctx.interaction.guildID ?? undefined,
            username: ctx.user.username,
            guildName: ctx.guild?.name ?? undefined
          })

          if (!result.data?.ok || !result.data.image) {
            throw new Error('Image generation failed')
          }

          const imageResponse = await fetch(result.data.image)
          if (!imageResponse.ok) {
            throw new Error('Failed to fetch generated image')
          }
          const imageArrayBuffer = await imageResponse.arrayBuffer()
          const imageBuffer = Buffer.from(imageArrayBuffer)

          const resultEmbed = embed
            .setImage('attachment://generated-image.jpg')
            .setDescription(`**Prompt:** ${prompt}`)
            .setFooter({ text: 'Generated image' })

          await ctx.interaction.editOriginal({
            embeds: [resultEmbed],
            files: [
              {
                name: 'generated-image.jpg',
                contents: imageBuffer
              }
            ],
            attachments: []
          })
        } catch (error) {
          console.error('Error in image command:', error)

          const errorEmbed = embed
            .setImage(null!)
            .setDescription(
              '❌ Failed to generate image. Please try again later.'
            )
            .setFooter({ text: 'Internal error occurred.' })

          await ctx.interaction.editOriginal({
            embeds: [errorEmbed],
            files: [],
            attachments: []
          })
        }
      }
    },
    {
      name: 'remix-avatar',
      description: "Remix a user's avatar with AI image generation.",
      options: [
        {
          name: 'prompt',
          type: ApplicationCommandOptionTypes.STRING,
          description: 'Description of how to remix the avatar',
          required: true
        },
        {
          name: 'user',
          type: ApplicationCommandOptionTypes.USER,
          description:
            'The user whose avatar to remix (defaults to your avatar)',
          required: false
        },
        {
          name: 'ephemeral',
          type: ApplicationCommandOptionTypes.BOOLEAN,
          description:
            'Ephemeral, only visible to the user who ran the command.',
          required: false
        }
      ],
      cooldown: 10,
      async run(ctx) {
        const user = ctx.options.getUser('user') ?? ctx.user
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
            name: `Remixing ${user.username}'s avatar`,
            iconURL: user.avatarURL()
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

        const avatarURL = user.avatarURL()
        if (!avatarURL) {
          const errorEmbed = embed
            .setImage(null!)
            .setDescription('❌ User does not have an avatar.')
            .setFooter({ text: 'Error occurred while fetching avatar.' })

          return await ctx.interaction.editOriginal({
            embeds: [errorEmbed],
            files: [],
            attachments: []
          })
        }

        try {
          const avatarResponse = await fetch(avatarURL)
          if (!avatarResponse.ok) {
            throw new Error('Failed to fetch avatar')
          }
          const avatarArrayBuffer = await avatarResponse.arrayBuffer()
          const avatarBuffer = Buffer.from(avatarArrayBuffer)
          const avatarBase64 = avatarBuffer.toString('base64')

          const imageBytes = await imagetoimage(avatarBase64, prompt)

          const resultEmbed = embed
            .setImage(null!)
            .setDescription(`**Prompt:** ${prompt}`)
            .setFooter({ text: `Remixed avatar of ${user.username}` })

          await ctx.interaction.editOriginal({
            embeds: [resultEmbed],
            files: [
              {
                name: 'remixed-avatar.png',
                contents: imageBytes
              }
            ],
            attachments: []
          })
        } catch (error) {
          console.error('Error in remix-avatar command:', error)

          const errorEmbed = embed
            .setImage(null!)
            .setDescription(
              '❌ Failed to remix the avatar. Please try again later.'
            )
            .setFooter({ text: 'Internal error occurred.' })

          await ctx.interaction.editOriginal({
            embeds: [errorEmbed],
            files: [],
            attachments: []
          })
        }
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
      name: 'summarize',
      description: 'Summarize the last 25 messages in this channel.',
      guildOnly: true,
      async run(ctx) {
        if (!ctx.guild || !ctx.interaction.channel) {
          return ctx.reply('This command can only be used in a server.')
        }

        const loading = await Bun.fetch(
          'https://github.com/taskylizard/kanikou/blob/trunk/apps/bot/public/loading.gif?raw=true'
        )
        const response = await loading.arrayBuffer()
        const buffer = Buffer.from(response)

        const embed = new Embed()
          .setFooter({
            text: 'Summarizing last 25 messages in this channel...'
          })
          .setAuthor({
            name: 'Chat Summary',
            iconURL: ctx.user.avatarURL()
          })
          .setImage('attachment://loading.gif')

        const msg = await ctx.interaction.createFollowup({
          embeds: [embed],
          files: [
            {
              name: 'loading.gif',
              contents: buffer
            }
          ]
        })

        const message = await msg.getMessage()

        try {
          const messages = await getMessages(
            ctx.interaction.channel as any,
            25
          )

          if (typeof messages === 'undefined' || messages.length === 0) {
            const errorEmbed = embed
              .setImage(null!)
              .setDescription('❌ No messages were found to summarize.')
              .setFooter({ text: 'Error occurred while fetching messages.' })

            return await ctx.interaction.editFollowup(message.id, {
              embeds: [errorEmbed],
              files: [],
              attachments: []
            })
          }

          const personalityContext = await buildPersonalityContext(
            ctx.client,
            ctx.user.id
          )

          const baseSystemPrompt =
            `You are a helpful assistant that creates concise, informative summaries of chat conversations.
Analyze the provided chat messages and create a summary that:
- Captures the main topics discussed
- Highlights key decisions or conclusions
- Notes important questions or unresolved issues

Format your response as a clear, readable summary without excessive formatting.`

          const systemPrompt = personalityContext
            ? `${personalityContext}\n\n${baseSystemPrompt}`
            : baseSystemPrompt

          const formattedMessages = messages
            .map((msg) => textifyMessageForGPTModels(msg))
            .join('\n')

          const prompt =
            `Please summarize the following chat conversation:\n\n${formattedMessages}`

          const result = await generateVelvetText(prompt, systemPrompt, {
            userId: ctx.user.id,
            guildId: ctx.interaction.guildID ?? undefined,
            username: ctx.user.username,
            guildName: ctx.guild?.name ?? undefined
          })

          if (!result.data || !result.data.ok) {
            const errorEmbed = embed
              .setImage(null!)
              .setDescription(
                `❌ Failed to generate summary: ${
                  result.data?.error || 'Unknown error'
                }`
              )
              .setFooter({ text: 'Error occurred during text generation.' })

            return await ctx.interaction.editFollowup(message.id, {
              embeds: [errorEmbed],
              files: [],
              attachments: []
            })
          }

          const summaryEmbed = embed
            .setImage(null!)
            .setDescription(result.data.output || 'No summary generated.')
            .setFooter({
              text: `Summarized ${messages.length} messages`
            })

          return await ctx.interaction.editFollowup(message.id, {
            embeds: [summaryEmbed],
            files: [],
            attachments: []
          })
        } catch (error) {
          console.error('Error in summarize command:', error)

          const errorEmbed = embed
            .setImage(null!)
            .setDescription(
              '❌ An error occurred while generating the summary. Please try again.'
            )
            .setFooter({ text: 'Internal error occurred.' })

          return await ctx.interaction.editFollowup(message.id, {
            embeds: [errorEmbed],
            files: [],
            attachments: []
          })
        }
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
          whitelistedChannels = whitelistedChannels.filter(
            (id: bigint) => id !== channelId
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
        const list = (updatedConfig?.aiWhitelistedChannels as bigint[])
          ?.map((id: bigint) => `<#${String(id)}>`)
          .join(', ') || 'None'
        await ctx.reply(
          `Channel ${channel.name} ${
            action === 'add' ? 'added to' : 'removed from'
          }  whitelist.\n\nCurrent whitelisted channels: ${list}`
        )
      }
    },
    {
      name: 'tasks',
      description: 'Manage your AI tasks (routine scheduled agents).',
      async run(ctx) {
        const tasks = await ctx.client.prisma.aITask.findMany({
          where: {
            userId: ctx.user.id
          },
          orderBy: {
            createdAt: 'desc'
          }
        })

        const taskCount = tasks.filter((t: any) => t.isActive).length

        const msg = (
          <ComponentMessage>
            <Container accentColor={0x5865f2}>
              <TextDisplay># Tasks</TextDisplay>
              <TextDisplay>‐# You have {taskCount}/3 active tasks</TextDisplay>
              <Separator spacing={SeparatorSpacingSize.LARGE} />
              <ActionRow>
                <StringSelect
                  customID='ai.tasks.action'
                  placeholder='Choose an action'
                >
                  <StringOption
                    value='create'
                    label='Create Task'
                    description='Create a new AI task'
                  />
                  <StringOption
                    value='list'
                    label='List Tasks'
                    description='View all your tasks'
                  />
                  <StringOption
                    value='edit'
                    label='Edit Task'
                    description='Modify an existing task'
                  />
                  <StringOption
                    value='toggle'
                    label='Toggle Task'
                    description='Enable or disable a task'
                  />
                  <StringOption
                    value='delete'
                    label='Delete Task'
                    description='Remove a task permanently'
                  />
                </StringSelect>
              </ActionRow>
            </Container>
          </ComponentMessage>
        )
        return await ctx.reply(msg)
      }
    },
    {
      name: 'personality',
      description: 'Customize how AI responds to you.',
      subcommands: [
        {
          name: 'set',
          description: 'Set your AI response personalization preferences.',
          options: [
            {
              name: 'tone',
              type: ApplicationCommandOptionTypes.STRING,
              description:
                'Overall tone of responses (casual, professional, friendly, sarcastic, balanced)',
              required: false,
              choices: [
                { name: 'Balanced', value: 'balanced' },
                { name: 'Casual', value: 'casual' },
                { name: 'Professional', value: 'professional' },
                { name: 'Friendly', value: 'friendly' },
                { name: 'Sarcastic', value: 'sarcastic' }
              ]
            },
            {
              name: 'verbosity',
              type: ApplicationCommandOptionTypes.STRING,
              description: 'Length of responses',
              required: false,
              choices: [
                { name: 'Concise', value: 'concise' },
                { name: 'Normal', value: 'normal' },
                { name: 'Detailed', value: 'detailed' },
                { name: 'Comprehensive', value: 'comprehensive' }
              ]
            },
            {
              name: 'personality_tags',
              type: ApplicationCommandOptionTypes.STRING,
              description:
                'Personality traits (comma-separated: humorous, technical, creative, empathetic, witty)',
              required: false
            },
            {
              name: 'language_style',
              type: ApplicationCommandOptionTypes.STRING,
              description: 'Language variation',
              required: false,
              choices: [
                { name: 'Standard', value: 'standard' },
                { name: 'Informal', value: 'informal' },
                { name: 'Internet-speak', value: 'internet-speak' },
                { name: 'Formal', value: 'formal' }
              ]
            },
            {
              name: 'response_format',
              type: ApplicationCommandOptionTypes.STRING,
              description: 'Preferred response format',
              required: false,
              choices: [
                { name: 'Mixed', value: 'mixed' },
                { name: 'Code-first', value: 'code-first' },
                { name: 'Text-first', value: 'text-first' },
                { name: 'Markdown-heavy', value: 'markdown-heavy' }
              ]
            },
            {
              name: 'custom_prompt',
              type: ApplicationCommandOptionTypes.STRING,
              description:
                'Custom instructions for the AI (e.g., "You are my coding assistant")',
              required: false
            },
            {
              name: 'excluded_topics',
              type: ApplicationCommandOptionTypes.STRING,
              description: 'Topics to avoid (comma-separated)',
              required: false
            }
          ],
          async run(ctx) {
            const tone = ctx.options.getString('tone', false)
            const verbosity = ctx.options.getString('verbosity', false)
            const personalityTags = ctx.options.getString(
              'personality_tags',
              false
            )
            const languageStyle = ctx.options.getString(
              'language_style',
              false
            )
            const responseFormat = ctx.options.getString(
              'response_format',
              false
            )
            const customPrompt = ctx.options.getString('custom_prompt', false)
            const excludedTopics = ctx.options.getString(
              'excluded_topics',
              false
            )

            const updateData: any = {}

            if (tone) updateData.tone = tone
            if (verbosity) updateData.verbosity = verbosity
            if (personalityTags !== null) {
              updateData.personalityTags = personalityTags
                ? personalityTags
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean)
                : []
            }
            if (languageStyle) updateData.languageStyle = languageStyle
            if (responseFormat) updateData.responseFormat = responseFormat
            if (customPrompt !== null) updateData.customPrompt = customPrompt
            if (excludedTopics !== null) {
              updateData.excludedTopics = excludedTopics
                ? excludedTopics
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean)
                : []
            }

            if (Object.keys(updateData).length === 0) {
              return await ctx.reply({
                content: 'Please provide at least one preference to update.',
                flags: 64
              })
            }

            await ctx.client.prisma.userAIConfig.upsert({
              where: { userId: ctx.user.id },
              update: updateData,
              create: {
                userId: ctx.user.id,
                ...updateData
              }
            })

            const changes = []
            if (tone) changes.push(`**Tone:** ${tone}`)
            if (verbosity) changes.push(`**Verbosity:** ${verbosity}`)
            if (personalityTags !== null) {
              const tags = personalityTags
                ? personalityTags
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean)
                : []
              changes.push(
                `**Personality Tags:** ${
                  tags.length > 0 ? tags.join(', ') : 'none'
                }`
              )
            }
            if (languageStyle) {
              changes.push(`**Language Style:** ${languageStyle}`)
            }
            if (responseFormat) {
              changes.push(`**Response Format:** ${responseFormat}`)
            }
            if (customPrompt !== null) {
              changes.push(`**Custom Prompt:** ${customPrompt || 'none'}`)
            }
            if (excludedTopics !== null) {
              const topics = excludedTopics
                ? excludedTopics
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean)
                : []
              changes.push(
                `**Excluded Topics:** ${
                  topics.length > 0 ? topics.join(', ') : 'none'
                }`
              )
            }

            return await ctx.reply({
              content:
                `Your AI personalization has been updated!\n\n${
                  changes.join(
                    '\n'
                  )
                }\n\n` +
                `These preferences will be applied to all your AI commands.`,
              flags: 64
            })
          }
        },
        {
          name: 'view',
          description: 'View your current AI personalization preferences.',
          async run(ctx) {
            const config = await ctx.client.prisma.userAIConfig.findUnique({
              where: { userId: ctx.user.id }
            })

            if (!config) {
              return await ctx.reply({
                content:
                  "You haven't set any personalization preferences yet. Use `/ai personality set` to configure them!",
                flags: 64
              })
            }

            const tags = config.personalityTags.length > 0
              ? config.personalityTags.join(', ')
              : 'none'
            const excluded = config.excludedTopics.length > 0
              ? config.excludedTopics.join(', ')
              : 'none'

            const embed = new Embed()
              .setAuthor({
                name: `${ctx.user.username}'s AI Personalization`,
                iconURL: ctx.user.avatarURL()
              })
              .setColor(0x6b7280)
              .addField('Tone', config.tone, true)
              .addField('Verbosity', config.verbosity, true)
              .addField('Language Style', config.languageStyle, true)
              .addField('Response Format', config.responseFormat, true)
              .addField('Personality Tags', tags, true)
              .addField('Excluded Topics', excluded, true)

            if (config.customPrompt) {
              embed.addField('Custom Prompt', config.customPrompt, false)
            }

            embed.addField(
              '-# Updated',
              `<t:${Math.floor(config.updatedAt.getTime() / 1000)}:R>`
            )

            return await ctx.reply({
              embeds: [embed],
              flags: 64
            })
          }
        },
        {
          name: 'reset',
          description: 'Reset your AI personalization to default settings.',
          async run(ctx) {
            await ctx.client.prisma.userAIConfig.upsert({
              where: { userId: ctx.user.id },
              update: {
                tone: 'balanced',
                verbosity: 'normal',
                personalityTags: [],
                languageStyle: 'standard',
                responseFormat: 'mixed',
                customPrompt: null,
                excludedTopics: []
              },
              create: {
                userId: ctx.user.id,
                tone: 'balanced',
                verbosity: 'normal',
                personalityTags: [],
                languageStyle: 'standard',
                responseFormat: 'mixed',
                customPrompt: null,
                excludedTopics: []
              }
            })

            return await ctx.reply({
              content:
                'Your AI personalization has been reset to default settings.\n\n' +
                '**Defaults:**\n' +
                '• Tone: balanced\n' +
                '• Verbosity: normal\n' +
                '• Language Style: standard\n' +
                '• Response Format: mixed\n' +
                '• Personality Tags: none\n' +
                '• Excluded Topics: none',
              flags: 64
            })
          }
        }
      ]
    }
  ]
})
