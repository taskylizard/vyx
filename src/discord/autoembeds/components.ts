import { ComponentTypes, type TextDisplayComponent, type UnfurledMediaItem } from 'oceanic.js'

export function discordTimestamp(timestamp?: string | null): string | undefined {
  if (!timestamp) {
    return undefined
  }

  const milliseconds = Date.parse(timestamp)
  return Number.isNaN(milliseconds) ? undefined : `<t:${Math.floor(milliseconds / 1000)}:F>`
}

export function escapeMarkdown(content: string): string {
  return content.replaceAll('\\', '\\\\').replaceAll('_', '\\_')
}

export function trimComponentText(content: string, maxCharacters: number): string {
  const characters = Array.from(content)
  if (characters.length <= maxCharacters) {
    return content
  }

  return `${characters.slice(0, Math.max(0, maxCharacters - 3)).join('')}...`
}

export function textDisplay(content: string): TextDisplayComponent {
  return {
    content,
    type: ComponentTypes.TEXT_DISPLAY
  }
}

export function unfurledMedia(url: string): UnfurledMediaItem {
  return { url }
}
