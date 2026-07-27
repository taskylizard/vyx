const HTTP_LINK_PATTERN = /<https?:\/\/[^\s<>]+>|https?:\/\/[^\s<>]+/giu
const TRAILING_SENTENCE_PUNCTUATION_PATTERN = /[.,!?;:'"]/u
const OPENING_DELIMITER_BY_CLOSING = new Map<string, string>([
  [')', '('],
  [']', '['],
  ['}', '{']
])

export function suppressLinkEmbeds(text: string): string {
  return text.replace(HTTP_LINK_PATTERN, (link) => {
    if (link.startsWith('<')) {
      return link
    }

    let urlEnd = link.length

    while (urlEnd > 0) {
      const finalCharacter = link.charAt(urlEnd - 1)
      const openingDelimiter = OPENING_DELIMITER_BY_CLOSING.get(finalCharacter)
      if (
        TRAILING_SENTENCE_PUNCTUATION_PATTERN.test(finalCharacter) ||
        (openingDelimiter !== undefined &&
          hasUnmatchedClosingDelimiter(link.slice(0, urlEnd), openingDelimiter, finalCharacter))
      ) {
        urlEnd -= 1
      } else {
        break
      }
    }

    return `<${link.slice(0, urlEnd)}>${link.slice(urlEnd)}`
  })
}

function hasUnmatchedClosingDelimiter(
  link: string,
  openingDelimiter: string,
  closingDelimiter: string
): boolean {
  let balance = 0

  for (const character of link) {
    if (character === openingDelimiter) {
      balance += 1
    } else if (character === closingDelimiter) {
      balance -= 1
    }
  }

  return balance < 0
}
