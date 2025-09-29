import { type Context, defineSlashCommand } from '#framework'
import { ApplicationCommandOptionTypes, ChannelTypes } from 'oceanic.js'

// Helper function to check setup status (excludes setup-related commands)
async function checkSetupRequired(
  ctx: Context,
  allowedCommands = ['setup', 'add', 'settings']
) {
  const subcommand = ctx.options.getSubCommand(false)

  if (subcommand && subcommand.length > 0) {
    const subcommandName = subcommand[0]
    // Allow these commands even if setup is incomplete
    if (allowedCommands.includes(subcommandName)) {
      return true
    }
  }

  const { isComplete, missingFields } = await ctx.client.modules.queryEngine
    .isSetupComplete(
      ctx.interaction.guildID!
    )

  if (!isComplete) {
    const instructions = ctx.client.modules.queryEngine
      .getSetupInstructions()
    await ctx.reply(
      `❌ **Setup required first**\n> Missing: ${
        missingFields.join(', ')
      }\n\n${instructions}`,
      true
    )
    return false
  }

  return true
}

export default defineSlashCommand({
  name: 'query-engine',
  description: 'Manage query engine data sources.',
  guildOnly: true,
  requiredPermissions: ['MANAGE_GUILD'],
  ownerOnly: true,
  moduleId: 'QUERY_ENGINE',
  subcommands: [
    {
      name: 'setup',
      description: 'Check setup status and get instructions.',

      async run(ctx) {
        await ctx.defer()

        try {
          const { isComplete, missingFields } = await ctx.client.modules
            .queryEngine.isSetupComplete(
              ctx.interaction.guildID!
            )

          if (isComplete) {
            await ctx.interaction.editOriginal({
              content:
                '✅ **Query engine is fully configured and ready to use!**'
            })
            return
          }

          const instructions = ctx.client.modules.queryEngine
            .getSetupInstructions()
          await ctx.interaction.editOriginal({
            content: `❌ **Setup incomplete**\n> Missing: ${
              missingFields.join(', ')
            }\n\n${instructions}`
          })
        } catch (error) {
          await ctx.interaction.editOriginal({
            content: `❌ **Failed to check setup status**\n> ${
              (error as Error).message
            }`
          })
        }
      }
    },
    {
      name: 'add',
      description: 'Add a GitHub repository as a data source.',
      options: [
        {
          name: 'owner',
          description: 'GitHub repository owner (e.g., "microsoft")',
          type: ApplicationCommandOptionTypes.STRING,
          required: true
        },
        {
          name: 'repo',
          description: 'Repository name (e.g., "vscode")',
          type: ApplicationCommandOptionTypes.STRING,
          required: true
        },
        {
          name: 'path',
          description: 'Optional path within the repository (e.g., "docs/")',
          type: ApplicationCommandOptionTypes.STRING,
          required: false
        }
      ],

      async run(ctx) {
        const owner = ctx.options.getString('owner', true)
        const repo = ctx.options.getString('repo', true)
        const path = ctx.options.getString('path', false)

        await ctx.defer()

        try {
          await ctx.client.modules.queryEngine.addData(
            ctx.interaction.guildID!,
            owner,
            repo,
            path
          )

          await ctx.interaction.editOriginal({
            content: `✅ **Added data source**\n> \`${owner}/${repo}${
              path ? `/${path}` : ''
            }\`\n\n-# Run \`/query-engine compile\` to update the knowledge base.`
          })
        } catch (error) {
          await ctx.interaction.editOriginal({
            content: `❌ **Failed to add data source**\n> ${
              (error as Error).message
            }\n\n-# Make sure the repository and path exist.`
          })
        }
      }
    },
    {
      name: 'remove',
      description: 'Remove a GitHub repository data source.',
      options: [
        {
          name: 'owner',
          description: 'GitHub repository owner',
          type: ApplicationCommandOptionTypes.STRING,
          required: true
        },
        {
          name: 'repo',
          description: 'Repository name',
          type: ApplicationCommandOptionTypes.STRING,
          required: true
        },
        {
          name: 'path',
          description: 'Path within the repository (if specified when added)',
          type: ApplicationCommandOptionTypes.STRING,
          required: false
        }
      ],

      async run(ctx) {
        const owner = ctx.options.getString('owner', true)
        const repo = ctx.options.getString('repo', true)
        const path = ctx.options.getString('path', false)

        await ctx.defer()

        try {
          const result = await ctx.client.modules.queryEngine.removeData(
            ctx.interaction.guildID!,
            owner,
            repo,
            path
          )

          if (result.count === 0) {
            await ctx.interaction.editOriginal({
              content: `❌ **Data source not found**\n> \`${owner}/${repo}${
                path ? `/${path}` : ''
              }\`\n\n-# Use \`/query-engine list\` to see current sources.`
            })
            return
          }

          await ctx.interaction.editOriginal({
            content: `✅ **Removed data source**\n> \`${owner}/${repo}${
              path ? `/${path}` : ''
            }\`\n\n-# Run \`/query-engine compile\` to update the knowledge base.`
          })
        } catch (error) {
          await ctx.interaction.editOriginal({
            content: `❌ **Failed to remove data source**\n> ${
              (error as Error).message
            }`
          })
        }
      }
    },
    {
      name: 'list',
      description: 'List all configured data sources.',

      async run(ctx) {
        if (
          !(await checkSetupRequired(ctx, ['list', 'setup', 'add', 'settings']))
        ) return

        await ctx.defer()

        try {
          const data = await ctx.client.modules.queryEngine.listData(
            ctx.interaction.guildID!
          )

          if (data.length === 0) {
            await ctx.interaction.editOriginal({
              content:
                '**No data sources configured!**\n\n-# Add sources with `/query-engine add`.'
            })
            return
          }

          const sources = data
            .map((d: any, i: number) => {
              const source = `${d.owner}/${d.repo}${d.path ? `/${d.path}` : ''}`
              return `${i + 1}. \`${source}\``
            })
            .join('\n')

          await ctx.interaction.editOriginal({
            content:
              `**Data sources (${data.length})**\n${sources}\n\n-# Run \`/query-engine compile\` to update knowledge base.`
          })
        } catch (error) {
          await ctx.interaction.editOriginal({
            content: `❌ **Failed to list data sources**\n> ${
              (error as Error).message
            }`
          })
        }
      }
    },
    {
      name: 'compile',
      description: 'Compile all data sources into the knowledge base.',

      async run(ctx) {
        await ctx.defer()

        try {
          const count = await ctx.client.modules.queryEngine.compileData(
            ctx.interaction.guildID!
          )

          await ctx.interaction.editOriginal({
            content:
              `✅ **Compiled knowledge base**\n> processed **${count}** data sources\n\n-# The query engine will now use server-specific data`
          })
        } catch (error) {
          await ctx.interaction.editOriginal({
            content: `❌ **Failed to compile data**\n> ${
              (error as Error).message
            }`
          })
        }
      }
    },
    {
      name: 'settings',
      description: 'Configure query engine settings.',
      subcommands: [
        {
          name: 'personality',
          description: 'Set the AI personality/behavior.',
          options: [
            {
              name: 'value',
              description: 'The personality description for the AI',
              type: ApplicationCommandOptionTypes.STRING,
              required: true
            }
          ],

          async run(ctx) {
            const personality = ctx.options.getString('value', true)
            await ctx.defer()

            try {
              await ctx.client.modules.queryEngine.updateSettings(
                ctx.interaction.guildID!,
                { personality }
              )

              await ctx.interaction.editOriginal({
                content: `✅ **Updated personality**\n> ${
                  personality.substring(0, 100)
                }${personality.length > 100 ? '...' : ''}`
              })
            } catch (error) {
              await ctx.interaction.editOriginal({
                content: `❌ **Failed to update personality**\n> ${
                  (error as Error).message
                }`
              })
            }
          }
        },
        {
          name: 'example-qna',
          description: 'Set example Q&A for better responses.',
          options: [
            {
              name: 'value',
              description: 'Example questions and answers in markdown format',
              type: ApplicationCommandOptionTypes.STRING,
              required: true
            }
          ],

          async run(ctx) {
            const exampleQna = ctx.options.getString('value', true)
            await ctx.defer()

            try {
              await ctx.client.modules.queryEngine.updateSettings(
                ctx.interaction.guildID!,
                { exampleQna }
              )

              await ctx.interaction.editOriginal({
                content: `✅ **Updated example Q&A**\n> ${
                  exampleQna.substring(0, 100)
                }${exampleQna.length > 100 ? '...' : ''}`
              })
            } catch (error) {
              await ctx.interaction.editOriginal({
                content: `❌ **Failed to update example Q&A**\n> ${
                  (error as Error).message
                }`
              })
            }
          }
        },
        {
          name: 'system-prompt',
          description: 'Set the system prompt.',
          options: [
            {
              name: 'value',
              description:
                'The system prompt describing how to use the documentation.',
              type: ApplicationCommandOptionTypes.STRING,
              required: true
            }
          ],

          async run(ctx) {
            const systemPrompt = ctx.options.getString('value', true)
            await ctx.defer()

            try {
              await ctx.client.modules.queryEngine.updateSettings(
                ctx.interaction.guildID!,
                { systemPrompt }
              )

              await ctx.interaction.editOriginal({
                content: `✅ **Updated RAG system prompt**\n> ${
                  systemPrompt.substring(0, 100)
                }${systemPrompt.length > 100 ? '...' : ''}`
              })
            } catch (error) {
              await ctx.interaction.editOriginal({
                content: `❌ **Failed to update RAG system prompt**\n> ${
                  (error as Error).message
                }`
              })
            }
          }
        },
        {
          name: 'forum',
          description: 'Set the forum channel for automatic responses.',
          options: [
            {
              name: 'channel',
              description: 'The forum channel to monitor for questions',
              type: ApplicationCommandOptionTypes.CHANNEL,
              required: true
            }
          ],

          async run(ctx) {
            const channel = ctx.options.getChannel('channel', true)

            // Verify it's actually a forum channel
            if (channel.type !== ChannelTypes.GUILD_FORUM) {
              await ctx.reply(
                '❌ **Invalid channel type**\n> The selected channel must be a forum channel.',
                true
              )
              return
            }

            await ctx.defer()

            try {
              await ctx.client.modules.queryEngine.updateSettings(
                ctx.interaction.guildID!,
                { forumChannelId: BigInt(channel.id) }
              )

              await ctx.interaction.editOriginal({
                content:
                  `✅ **Updated forum channel**\n> <#${channel.id}> will now receive automatic responses.`
              })
            } catch (error) {
              await ctx.interaction.editOriginal({
                content: `❌ **Failed to update forum channel**\n> ${
                  (error as Error).message
                }`
              })
            }
          }
        },
        {
          name: 'remove-forum-channel',
          description: 'Remove the forum channel setting.',

          async run(ctx) {
            await ctx.defer()

            try {
              await ctx.client.modules.queryEngine.updateSettings(
                ctx.interaction.guildID!,
                { forumChannelId: null }
              )

              await ctx.interaction.editOriginal({
                content:
                  '✅ **Removed forum channel setting**\n\n-# the bot will no longer automatically answer in any forum'
              })
            } catch (error) {
              await ctx.interaction.editOriginal({
                content: `❌ **Failed to remove forum channel setting**\n> ${
                  (error as Error).message
                }`
              })
            }
          }
        },
        {
          name: 'view',
          description: 'View current settings.',

          async run(ctx) {
            await ctx.defer()

            try {
              const settings = await ctx.client.modules.queryEngine.getSettings(
                ctx.interaction.guildID!
              )

              if (!settings) {
                await ctx.interaction.editOriginal({
                  content:
                    '**No settings configured!**\n\n-# Configure settings with `/query-engine settings`.'
                })
                return
              }

              const fields: string[] = []

              if (settings.personality) {
                fields.push(
                  `**personality:**\n> ${
                    settings.personality.substring(0, 200)
                  }${settings.personality.length > 200 ? '...' : ''}`
                )
              }

              if (settings.exampleQna) {
                fields.push(
                  `**example Q&A:**\n> ${
                    settings.exampleQna.substring(0, 200)
                  }${settings.exampleQna.length > 200 ? '...' : ''}`
                )
              }

              if (settings.systemPrompt) {
                fields.push(
                  `**System prompt:**\n> ${
                    settings.systemPrompt.substring(0, 200)
                  }${settings.systemPrompt.length > 200 ? '...' : ''}`
                )
              }

              if (settings.forumChannelId) {
                fields.push(
                  `**forum channel:**\n> <#${settings.forumChannelId}>`
                )
              }

              const content = fields.length > 0
                ? `**query engine settings**\n\n${fields.join('\n\n')}`
                : '**no settings configured**\n\n-# using default settings'

              await ctx.interaction.editOriginal({ content })
            } catch (error) {
              await ctx.interaction.editOriginal({
                content: `❌ **failed to view settings**\n> ${
                  (error as Error).message
                }`
              })
            }
          }
        }
      ]
    },
    {
      name: 'clear',
      description: 'Remove all data sources (requires confirmation).',
      options: [
        {
          name: 'confirm',
          description: 'Type "CONFIRM" to proceed',
          type: ApplicationCommandOptionTypes.STRING,
          required: true
        }
      ],

      async run(ctx) {
        const confirm = ctx.options.getString('confirm', true)

        if (confirm !== 'CONFIRM') {
          await ctx.reply(
            '❌ **operation cancelled**\n> type `CONFIRM` exactly to clear all data sources',
            true
          )
          return
        }

        await ctx.defer()

        try {
          const count = await ctx.client.modules.queryEngine.clearData(
            ctx.interaction.guildID!
          )

          await ctx.interaction.editOriginal({
            content:
              `✅ **cleared all data sources**\n> removed **${count}** entries\n\n-# run \`/query-engine compile\` to reset knowledge base`
          })
        } catch (error) {
          await ctx.interaction.editOriginal({
            content: `❌ **failed to clear data**\n> ${
              (error as Error).message
            }`
          })
        }
      }
    }
  ]
})
