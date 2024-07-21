import { isNull, isUndefined } from '@antfu/utils';
import {
  type AnyTextableChannel,
  ChannelTypes,
  type JSONMessage,
  Message,
  type PossiblyUncachedMessage,
  type Uncached
} from 'oceanic.js';
import { type Client, Embed, definePlugin } from '#framework';

export default definePlugin({
  name: 'Moderation logging',
  onLoad(client) {
    client.on(
      'messageUpdate',
      async (message, oldMessage) =>
        await messageUpdate(client, message, oldMessage)
    );
    client.on(
      'messageDelete',
      async (message) => await messageDelete(client, message)
    );
  },

  onUnload(client) {
    client.off(
      'messageUpdate',
      async (message, oldMessage) =>
        await messageUpdate(client, message, oldMessage)
    );
    client.off(
      'messageDelete',
      async (message) => await messageDelete(client, message)
    );
  }
});

async function messageUpdate(
  client: Client,
  message: Message<AnyTextableChannel | Uncached>,
  oldMessage: JSONMessage | null
) {
  if (
    isUndefined(message) ||
    isUndefined(oldMessage) ||
    !(message instanceof Message) ||
    isUndefined(message.content) ||
    isNull(oldMessage) ||
    message.content === oldMessage.content ||
    isUndefined(oldMessage.guildID) ||
    isUndefined(message.author) ||
    isUndefined(message.channel) ||
    message.author.bot
  ) {
    return;
  }

  const config = await client.prisma.config.findUnique({
    where: {
      guildId: BigInt(oldMessage.guildID)
    },
    select: {
      logsChannel: true
    }
  });

  if (isNull(config) || !config.logsChannel) return;

  const channel = client.getChannel(config.logsChannel.toString());
  if (!channel || channel.type !== ChannelTypes.GUILD_TEXT) return;

  const { author } = message;

  const embed = new Embed()
    .setTitle('Message Edited')
    .setThumbnail(author.avatarURL())
    .setTimestamp(new Date().toISOString())
    .addFields([
      { name: 'Author', value: author.mention, inline: true },
      { name: 'Channel', value: message.channel.mention, inline: true },
      { name: 'Message link', value: message.jumpLink, inline: true },
      {
        name: 'Previous',
        value: oldMessage.content
      },
      {
        name: 'New',
        value: message.content
      }
    ]);

  return await channel.createMessage({ embeds: [embed] });
}

async function messageDelete(client: Client, message: PossiblyUncachedMessage) {
  if (
    isUndefined(message.channel) ||
    isUndefined(message.guildID) ||
    isNull(message.guildID) ||
    !(message instanceof Message) ||
    isUndefined(message.author) ||
    isUndefined(message.content) ||
    message.author.bot
  )
    return;

  const config = await client.prisma.config.findUnique({
    where: {
      guildId: BigInt(message.guildID)
    },
    select: {
      logsChannel: true
    }
  });

  if (!config || !config.logsChannel) return;

  const channel = client.getChannel(config.logsChannel.toString());
  if (isUndefined(channel) || channel.type !== ChannelTypes.GUILD_TEXT) return;

  const embed = new Embed()
    .setTitle('Message Delete')
    .setThumbnail(message.author.avatarURL())
    .addFields([
      { name: 'Author', value: message.author.mention },
      { name: 'Channel', value: message.channel.mention, inline: true },
      { name: 'Content', value: message.content }
    ])
    .setTimestamp(new Date().toISOString());

  return await channel.createMessage({ embeds: [embed] });
}
