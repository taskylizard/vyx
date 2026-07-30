import type { MediaGalleryItem } from 'oceanic.js'
import { z } from 'zod'
import type { ResolvedInstagramMedia } from './vendor/types.ts'

export const InstagramImageVersionsSchema = z.object({
  candidates: z
    .array(z.object({ url: z.string().nullable().optional() }))
    .nullable()
    .optional()
})

export const InstagramMediaSchema = z.object({
  image_versions2: InstagramImageVersionsSchema.nullable().optional(),
  media_type: z.number().nullable().optional(),
  video_versions: z
    .array(z.object({ url: z.string().nullable().optional() }))
    .nullable()
    .optional()
})

export const InstagramPostSchema = z.object({
  caption: z.object({ text: z.string().nullable().optional() }).nullable().optional(),
  carousel_media: z.array(InstagramMediaSchema).nullable().optional(),
  clips_metadata: z
    .object({
      music_info: z
        .object({
          music_asset_info: z
            .object({
              display_artist: z.string().nullable().optional(),
              title: z.string().nullable().optional()
            })
            .nullable()
            .optional()
        })
        .nullable()
        .optional()
    })
    .nullable()
    .optional(),
  coauthor_producers: z
    .array(z.object({ username: z.string().nullable().optional() }))
    .nullable()
    .optional(),
  comment_count: z.number().nullable().optional(),
  image_versions2: InstagramImageVersionsSchema.nullable().optional(),
  like_count: z.number().nullable().optional(),
  media_type: z.number().nullable().optional(),
  taken_at: z.number().nullable().optional(),
  user: z.object({
    full_name: z.string().nullable().optional(),
    is_verified: z.boolean().nullable().optional(),
    profile_pic_url: z.string().nullable().optional(),
    username: z.string()
  }),
  video_versions: z
    .array(z.object({ url: z.string().nullable().optional() }))
    .nullable()
    .optional()
})

export const InstagramPostResponseSchema = z.object({
  data: z
    .object({
      xdt_api__v1__media__shortcode__web_info: z
        .object({ items: z.array(InstagramPostSchema).nullable().optional() })
        .nullable()
        .optional()
    })
    .nullable()
    .optional()
})

export const InstagramSharerResponseSchema = z.object({
  data: z
    .object({
      xdt_get_relationship_for_shid_logged_out: z
        .object({
          sender: z.object({ username: z.string().nullable().optional() }).nullable().optional()
        })
        .nullable()
        .optional()
    })
    .nullable()
    .optional()
})

export type InstagramResolution =
  | { kind: 'rich'; post: InstagramPost }
  | { kind: 'media'; media: ResolvedInstagramMedia; strategy: 'native' | 'snapsave' }

export interface InstagramCacheEntry {
  expiresAt: number
  resolution: InstagramResolution | undefined
}

export type InstagramPost = z.infer<typeof InstagramPostSchema>
export type InstagramMedia = z.infer<typeof InstagramMediaSchema>
export type InstagramImageVersions = z.infer<typeof InstagramImageVersionsSchema>

export interface InstagramComponentAssets {
  mediaItems: Array<MediaGalleryItem>
}
