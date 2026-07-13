export interface ResolvedInstagramMedia {
  items: Array<ResolvedInstagramMediaItem>
}

export interface ResolvedInstagramMediaItem {
  thumbnail?: string
  type: 'image' | 'video'
  url: string
}
