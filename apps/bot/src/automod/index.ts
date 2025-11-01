import {
  colors,
  Embed,
  isTextableGuildChannel,
  truncateString
} from '#framework'
import type { Client } from '#framework'
import type { AutomodRuleType } from '@packages/database'
import type { Message } from 'oceanic.js'
import { formatUserMention } from '../commands/moderation/utils'

export interface AutomodRuleEntry {
  id: number
  guildId: string
  pattern: string
  type: AutomodRuleType
  regex: RegExp
}

export interface AutomodRuleMatch {
  rule: AutomodRuleEntry
  match: string
}

export interface AutomodLogContext {
  message: Message
  matches: AutomodRuleMatch[]
  content?: string
  deleted?: boolean
}

const cache = new Map<string, AutomodRuleEntry[]>()

export async function getAutomodRules(
  client: Client,
  guildId: string
): Promise<AutomodRuleEntry[]> {
  const cached = cache.get(guildId)
  if (cached) return cached

  const records = await client.prisma.automodRule.findMany({
    where: {
      guildId: BigInt(guildId),
      enabled: true
    }
  })

  const compiled: AutomodRuleEntry[] = []

  for (const record of records) {
    const regex = createRegex(record.type, record.pattern)
    if (!regex) continue
    compiled.push({
      id: record.id,
      guildId,
      pattern: record.pattern,
      type: record.type,
      regex
    })
  }

  cache.set(guildId, compiled)
  return compiled
}

export function invalidateAutomodCache(guildId: string): void {
  cache.delete(guildId)
}

export async function refreshAutomodCache(
  client: Client,
  guildId: string
): Promise<AutomodRuleEntry[]> {
  cache.delete(guildId)
  return await getAutomodRules(client, guildId)
}

export function findAutomodMatches(
  content: string,
  rules: AutomodRuleEntry[]
): AutomodRuleMatch[] {
  const matches: AutomodRuleMatch[] = []
  for (const rule of rules) {
    const match = content.match(rule.regex)
    if (!match) continue
    matches.push({
      rule,
      match: match[0] ?? rule.pattern
    })
  }
  return matches
}

function createRegex(type: AutomodRuleType, pattern: string): RegExp | null {
  try {
    if (type === 'WORD') {
      const escaped = escapeRegExp(pattern)
      return new RegExp(`\\b${escaped}\\b`, 'i')
    }

    return new RegExp(pattern, 'i')
  } catch (error) {
    console.error('Failed to compile automod rule', {
      type,
      pattern,
      error
    })
    return null
  }
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function logAutomodViolation(
  client: Client,
  { message, matches, content, deleted }: AutomodLogContext
): Promise<void> {
  if (!message.guildID) return

  try {
    const config = await client.prisma.config.findUnique({
      where: {
        guildId: BigInt(message.guildID)
      }
    })

    if (
      !config ||
      !config.logsEnabled ||
      !config.logsChannel ||
      !config.modules.includes('MODERATION')
    ) {
      return
    }

    const guild = client.guilds.get(message.guildID)
    const channel = guild?.channels.get(config.logsChannel.toString())

    if (!channel || !isTextableGuildChannel(channel)) return

    const logsChannel = channel

    const matchedRules = matches
      .map((entry) => `• ${entry.rule.type}: ${entry.rule.pattern}`)
      .join('\n')

    const matchedContent = matches
      .map((entry) => `• ${entry.match}`)
      .join('\n')

    const snapshot = content ?? message.content ?? ''

    const embed = new Embed()
      .setTitle('🚫 Automod Triggered')
      .setColor(colors.RED)
      .addField('Member', formatUserMention(message.author), true)
      .addField('Channel', `<#${message.channelID}>`, true)
      .addField(
        'Message',
        truncateString(snapshot || 'No content', 1024),
        false
      )
      .addField(
        'Matches',
        truncateString(matchedContent || 'Unknown', 1024),
        false
      )
      .addField('Rules', truncateString(matchedRules || 'Unknown', 1024), false)
      .addField(
        'Message Link',
        `[Jump](https://discord.com/channels/${message.guildID}/${message.channelID}/${message.id})`,
        false
      )
      .setTimestamp()

    if (typeof deleted === 'boolean') {
      embed.addField(
        'Deletion',
        deleted ? '✅ Message removed' : '⚠️ Failed to delete',
        true
      )
    }

    await logsChannel.createMessage({ embeds: [embed] })
  } catch (error) {
    console.error('Failed to log automod violation', {
      guildId: message.guildID,
      error
    })
  }
}
