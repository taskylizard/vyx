import type {
  Attachment,
  Collection,
  Embed,
  MessageMentions,
  User
} from 'oceanic.js';

export interface Mapping {
  discord: string;
  revolt: string;
  bots?: boolean;
}

export interface ConnectionPair extends Mapping {}

export interface CachedMessage {
  /** ID of the original message
   *
   * Tip: if it's discordCache, parent is the Discord message.
   */
  parentMessage: string;

  /** ID of the author of the original message */
  parentAuthor: string;

  /** ID of the message sent by the bot */
  createdMessage: string;

  /** ID of the channel the original message was sent in */
  channelId: string;
}

export interface PartialDiscordMessage {
  author: User;
  attachments: Collection<string, Attachment>;
  channelId: string;
  content: string;
  embeds: Embed[];
  id: string;
  mentions: MessageMentions;
}

export interface ReplyObject {
  pingable: boolean;
  entity?: string;
  entityImage?: string;
  originalUrl?: string;
  content: string;
  attachments: AttachmentType[];
  previewAttachment?: string;
}

export type AttachmentType = 'embed' | 'file';

export interface RevoltSourceParams {
  messageId: string;
  authorId: string;
  channelId: string;
}
