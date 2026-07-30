export function previewMemory(content: string, maxLength: number): string {
  const normalized = content.replaceAll(/\s+/g, ' ').trim()
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}…`
}
