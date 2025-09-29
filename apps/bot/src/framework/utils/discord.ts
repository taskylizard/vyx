import type { Client } from '#framework'
import {
  type AnyTextableChannel,
  type AnyTextableGuildChannel,
  type AnyThreadChannel,
  type Channel,
  type ChannelTypes,
  DiscordRESTError,
  type Guild,
  type Member,
  Message,
  type MessageTypes,
  type PrivateChannel,
  type RequestGuildMembersOptions,
  type TextableChannels,
  TextableChannelTypes,
  type TextableGuildChannels,
  TextableGuildChannelTypes,
  type ThreadChannels,
  ThreadChannelTypes,
  type Uncached,
  UndeletableMessageTypes,
  type User
} from 'oceanic.js'
import { createGuard } from './common'

export async function fetchMessageCached(
  client: Client,
  channel: AnyTextableGuildChannel,
  messageID: string
): Promise<Message> {
  return (
    channel.messages.get(messageID) ??
      (await client.rest.channels.getMessage(channel.id, messageID))
  )
}

export async function fetchUserCached(
  client: Client,
  userID: string
): Promise<User> {
  return client.users.get(userID) ?? (await client.rest.users.get(userID))
}

export async function fetchUserCachedSuppressed(
  client: Client,
  userID: string
): Promise<User | Uncached> {
  try {
    return await fetchUserCached(client, userID)
  } catch (error) {
    if (!(error instanceof DiscordRESTError)) throw error

    return { id: userID }
  }
}

export async function fetchMemberCached(
  client: Client,
  guild: Guild,
  userID: string
): Promise<Member> {
  return (
    guild.members.get(userID) ??
      (await client.rest.guilds.getMember(guild.id, userID))
  )
}

export function fetchBotUserCached(
  client: Client,
  guild: Guild
): Promise<Member> {
  return fetchMemberCached(client, guild, client.user.id)
}

export async function createDMCached(
  client: Client,
  userID: string
): Promise<PrivateChannel> {
  return (
    client.privateChannels.find((channel) => channel.recipient.id === userID) ??
      (await client.rest.users.createDM(userID))
  )
}

export async function fetchThreadCached(
  client: Client,
  guild: Guild,
  threadID: string
): Promise<AnyThreadChannel | null> {
  const cached = guild.threads.get(threadID)

  if (cached !== undefined) return cached

  if (client.getChannel(threadID) !== undefined) return null

  const fetched = await client.rest.channels.get(threadID)

  if (!isThreadChannel(fetched)) return null

  if (fetched.guildID !== guild.id) return null

  return fetched
}

export async function fetchTextableGuildChannelCached(
  client: Client,
  guild: Guild,
  channelID: string
): Promise<AnyTextableGuildChannel | null> {
  const cachedRegularChannel = guild.channels.get(channelID)

  if (cachedRegularChannel !== undefined) {
    if (isTextableGuildChannel(cachedRegularChannel)) {
      return cachedRegularChannel
    }
    return null
  }

  const cachedThreadChannel = guild.threads.get(channelID)

  if (cachedThreadChannel !== undefined) return cachedThreadChannel

  // must belong to another guild
  if (client.getChannel(channelID)) return null

  const fetched = await client.rest.channels.get(channelID)

  if (!isTextableGuildChannel(fetched)) return null

  if (fetched.guildID !== guild.id) return null

  return fetched
}

export async function fetchMembersCached(
  guild: Guild,
  userIDs: readonly string[],
  options?: Pick<RequestGuildMembersOptions, 'presences' | 'timeout'>
): Promise<Map<string, Member>> {
  const result: Map<string, Member> = new Map()
  const queue: string[] = []
  const promises: Promise<unknown>[] = []

  const request = (): void => {
    promises.push(
      guild.shard
        .requestGuildMembers(guild.id, {
          userIDs: queue,
          ...options
        })
        .then((members) =>
          members.forEach((member) => result.set(member.id, member))
        )
    )
    queue.length = 0
  }

  for (const id of userIDs) {
    const member = guild.members.get(id)
    if (member !== undefined) result.set(id, member)
    else {
      queue.push(id)
      if (queue.length === 100) request()
    }
  }

  if (queue.length > 0) request()

  await Promise.all(promises)
  return result
}

export const isThreadChannel = createGuard<Channel, AnyThreadChannel>(
  (channel) =>
    isThreadChannelType(channel.type)
      ? (channel as AnyThreadChannel)
      : undefined
)

export const isThreadChannelType = createGuard<ChannelTypes, ThreadChannels>(
  (type) =>
    ThreadChannelTypes.includes(type as ThreadChannels)
      ? (type as ThreadChannels)
      : undefined
)

export const isTextableChannel = createGuard<Channel, AnyTextableChannel>(
  (channel) =>
    isTextableChannelType(channel.type)
      ? (channel as AnyTextableChannel)
      : undefined
)

export const isTextableGuildChannel = createGuard<
  Channel,
  AnyTextableGuildChannel
>((channel) =>
  isTextableChannelType(channel.type) &&
    (channel as AnyTextableGuildChannel).guildID !== undefined
    ? (channel as AnyTextableGuildChannel)
    : undefined
)

export const isTextableGuildChannelType = createGuard<
  ChannelTypes,
  TextableGuildChannels
>((type) =>
  TextableGuildChannelTypes.includes(type as TextableGuildChannels)
    ? (type as TextableGuildChannels)
    : undefined
)

export const isTextableChannelType = createGuard<
  ChannelTypes,
  TextableChannels
>((type) =>
  TextableChannelTypes.includes(type as TextableChannels)
    ? (type as TextableChannels)
    : undefined
)

export const isUndeletableMessageType = createGuard<
  MessageTypes,
  (typeof UndeletableMessageTypes)[number]
>((type) =>
  UndeletableMessageTypes.includes(
      type as (typeof UndeletableMessageTypes)[number]
    )
    ? (type as (typeof UndeletableMessageTypes)[number])
    : undefined
)

/**
 * A simple discord.js-like embed builder
 */
export class Embed {
  public title?: string
  public description?: string
  public url?: string
  public timestamp?: string
  public color?: number = 0xaec5e8
  public footer?: EmbedFooter
  public image?: EmbedImage
  public thumbnail?: EmbedImage
  public author?: EmbedAuthor
  public fields?: EmbedField[]

  public setTitle(title: string): this {
    this.title = title
    return this
  }

  public setDescription(description: string): this {
    this.description = description
    return this
  }

  public setURL(url: string): this {
    this.url = url
    return this
  }

  public setTimestamp(timestamp?: string): this {
    this.timestamp = timestamp || new Date().toISOString()
    return this
  }

  public setColor(color: number): this {
    this.color = color
    return this
  }

  public setFooter(data: EmbedFooter): this {
    this.footer = data
    return this
  }

  public setImage(url: string): this {
    this.image = { url }
    return this
  }

  public setThumbnail(url: string): this {
    this.thumbnail = { url }
    return this
  }

  public setAuthor(data: EmbedAuthor): this {
    this.author = data
    return this
  }

  public addFields(fields: EmbedField[]): this {
    for (const field of fields) {
      this.addField(field.name, field.value, field.inline)
    }

    return this
  }

  public addField(name: string, value: string, inline?: boolean): this {
    if (!this.fields) this.fields = []

    this.fields.push({ name, value, inline })

    return this
  }

  public spliceFields(
    start: number,
    deleteCount: number,
    ...fields: EmbedField[]
  ): this {
    this.fields?.splice(start, deleteCount, ...fields)
    return this
  }
}

export interface EmbedFooter {
  text: string
  iconURL?: string
}

export interface EmbedImage {
  url: string
}

export interface EmbedAuthor {
  name: string
  url?: string
  iconURL?: string
}

export interface EmbedField {
  name: string
  value: string
  inline?: boolean
}
