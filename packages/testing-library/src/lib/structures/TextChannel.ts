import {
  type CreateMessageOptions,
  Message,
  MessageTypes,
  type RawAttachment,
  type RawMessage,
  TextChannel as OTextChannel
} from 'oceanic.js'

import { type Client } from '../Client'

export class TextChannel extends OTextChannel {
  declare client: Client

  override async createMessage(
    options: CreateMessageOptions
  ): Promise<Message<OTextChannel>> {
    const id = Date.now().toString()

    const data: RawMessage = {
      attachments: options.attachments?.map((a, i) => ({
        filename: a.filename ?? 'attachment_' + i.toString(),
        id: String(a.id!),
        proxy_url: 'attachment_proxy_url',
        size: 0,
        url: 'attachment_url',
        description: a.description
      } satisfies RawAttachment)).concat(
        options.files?.map((f, i) => ({
          filename: f.name,
          id: 'file_' + i.toString(),
          proxy_url: 'file_proxy_url',
          size: 0,
          url: 'file_url',
          description: undefined
        } satisfies RawAttachment)) ?? []
      ) ?? [],
      author: this.client.__testing__.selfUserRaw,
      channel_id: this.id,
      content: options.content ?? '',
      edited_timestamp: null,
      embeds: [],
      id,
      mention_everyone: false,
      mention_roles: [],
      mentions: [],
      pinned: false,
      timestamp: id,
      tts: false,
      type: MessageTypes.DEFAULT
    }

    const message = new Message<TextChannel>(data, this.client)

    this.messages.add(message)

    return message
  }
}
