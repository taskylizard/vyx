const MARKDOWN_LINK_PATTERN = /\[([^\]]*)\]\(<?(https?:\/\/[^)>]+)>?\)/g

export function formatCitations(text: string): string {
  const urlNumbers = new Map<string, number>()
  let nextNumber = 1

  return text.replace(MARKDOWN_LINK_PATTERN, (_fullMatch: string, _label: string, url: string) => {
    const existingNumber = urlNumbers.get(url)
    const number = existingNumber ?? nextNumber
    if (existingNumber === undefined) {
      urlNumbers.set(url, nextNumber)
      nextNumber += 1
    }

    return `[[${number}]](<${url}>)`
  })
}
