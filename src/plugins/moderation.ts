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
    !message ||
    !oldMessage ||
    !(message instanceof Message) ||
    !message.content ||
    message.content === oldMessage.content ||
    !oldMessage.guildID ||
    !message.author ||
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

  if (!config?.logsChannel) return;

  const channel = client.getChannel(config.logsChannel.toString());
  if (channel?.type !== ChannelTypes.GUILD_TEXT) return;

  const { member } = message;

  const embed = new Embed()
    .setTitle('Message Edited')
    .setThumbnail(member!.avatarURL())
    .addFields([
      { name: 'Author', value: member!.user.mention },
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
    !message.guildID ||
    !(message instanceof Message) ||
    !message.author ||
    !message.content ||
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
  if (!channel || channel.type !== ChannelTypes.GUILD_TEXT) return;

  const embed = new Embed()
    .setTitle('Message Delete')
    .setThumbnail(message.author.avatarURL())
    .addFields([
      { name: 'Author', value: message.author.mention },
      { name: 'Content', value: message.content }
    ]);

  return await channel.createMessage({ embeds: [embed] });
}
