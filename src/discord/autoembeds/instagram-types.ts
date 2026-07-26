import type { MediaGalleryItem } from 'oceanic.js'
import type { ResolvedInstagramMedia } from './vendor/types.ts'

export type InstagramResolution =
  | { kind: 'rich'; post: InstagramPost }
  | { kind: 'media'; media: ResolvedInstagramMedia; strategy: 'native' | 'snapsave' }

export interface InstagramCacheEntry {
  expiresAt: number
  resolution: InstagramResolution | undefined
}

export interface InstagramPost {
  caption?: { text?: string | null } | null
  carousel_media?: Array<InstagramMedia> | null
  clips_metadata?: {
    music_info?: {
      music_asset_info?: {
        display_artist?: string | null
        title?: string | null
      } | null
    } | null
  } | null
  coauthor_producers?: Array<{ username?: string | null }> | null
  comment_count?: number | null
  image_versions2?: InstagramImageVersions | null
  like_count?: number | null
  media_type?: number | null
  taken_at?: number | null
  user: {
    full_name?: string | null
    is_verified?: boolean | null
    profile_pic_url?: string | null
    username: string
  }
  video_versions?: Array<{ url?: string | null }> | null
}

export interface InstagramMedia {
  image_versions2?: InstagramImageVersions | null
  media_type?: number | null
  video_versions?: Array<{ url?: string | null }> | null
}

export interface InstagramImageVersions {
  candidates?: Array<{ url?: string | null }> | null
}

export interface InstagramComponentAssets {
  mediaItems: Array<MediaGalleryItem>
}
