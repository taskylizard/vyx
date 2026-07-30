import type { File as DiscordFile, MediaGalleryItem } from 'oceanic.js'
import { z } from 'zod'

const TwitterAccountFieldSchema = z.object({
  name: z.string().nullable().optional(),
  value: z.string().nullable().optional()
})

const TwitterAccountSchema = z.object({
  acct: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
  display_name: z.string().nullable().optional(),
  fields: z.array(TwitterAccountFieldSchema).nullable().optional(),
  username: z.string().nullable().optional()
})

const TwitterMediaAttachmentSchema = z.object({
  description: z.string().nullable().optional(),
  preview_url: z.string().nullable().optional(),
  url: z.string().nullable().optional()
})

export const TwitterStatusSchema = z.object({
  account: TwitterAccountSchema.nullable().optional(),
  content: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  media_attachments: z.array(TwitterMediaAttachmentSchema).nullable().optional()
})

export type TwitterStatus = z.infer<typeof TwitterStatusSchema>

export interface TwitterComponentAssets {
  avatarReference?: string
  mediaItems: Array<MediaGalleryItem>
}

export interface PreparedTwitterAssets extends TwitterComponentAssets {
  files: Array<DiscordFile>
}
