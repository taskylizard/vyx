import { randomInt } from 'node:crypto'
import type { JumbleAnswerVariant } from './types.ts'

/** Remove the edition suffixes commonly appended to album names by services. */
export function removeEditionSuffix(value: string): string {
  let result = value.trim()
  let previous = ''
  while (result !== previous) {
    previous = result
    result = result
      .replace(/\s*\([^)]*\)\s*$/u, '')
      .replace(/\s*\[[^\]]*\]\s*$/u, '')
      .replace(
        /\s+-\s+(?:the\s+)?\d+(?:st|nd|rd|th)\s+(?:mini\s+)?album(?:\s+repackage)?\s*$/iu,
        ''
      )
      .replace(/\s+-\s+(?:the\s+)?\d+(?:st|nd|rd|th)\s+album(?:\s+repackage)?\s*$/iu, '')
  }
  return result.trim()
}

/** Normalize a guess using forgiving rules that work well for music titles. */
export function normalizeAnswer(value: string): string {
  return normalizeAnswerText(value).replace(/[^\p{Letter}\p{Number}]+/gu, '')
}

function normalizeAnswerText(value: string): string {
  return removeEditionSuffix(value)
    .trim()
    .normalize('NFKD')
    .replace(/[Øø]/gu, 'o')
    .replace(/[Đđ]/gu, 'd')
    .replace(/[Łł]/gu, 'l')
    .replace(/[ß]/gu, 'ss')
    .replace(/[Ææ]/gu, 'ae')
    .replace(/[Œœ]/gu, 'oe')
    .replace(/[Åå]/gu, 'a')
    .replace(/[Λλ]/gu, 'a')
    .replace(/&/gu, ' and ')
    .replace(/…/gu, '...')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
}

export function levenshteinDistance(first: string, second: string): number {
  if (first === second) return 0
  if (first.length === 0) return second.length
  if (second.length === 0) return first.length

  let previous = Array.from({ length: second.length + 1 }, (_, index) => index)
  let current = Array.from({ length: second.length + 1 }, () => 0)
  for (let row = 1; row <= first.length; row += 1) {
    current[0] = row
    for (let column = 1; column <= second.length; column += 1) {
      const substitution = previous[column - 1]! + (first[row - 1] === second[column - 1] ? 0 : 1)
      current[column] = Math.min(previous[column]! + 1, current[column - 1]! + 1, substitution)
    }
    ;[previous, current] = [current, previous]
  }
  return previous[second.length]!
}

export function answerMatches(correctAnswer: string, guess: string): boolean {
  return answerMatchesAny([correctAnswer], guess)
}

/** Match a guess against a canonical title and bounded provider-supplied aliases. */
export function answerMatchesAny(
  correctAnswers: readonly (string | JumbleAnswerVariant)[],
  guess: string
): boolean {
  const actualRaw = guess.trim()
  if (actualRaw.length === 0) return false
  const actual = normalizeAnswer(actualRaw)
  let actualWords: string[] | undefined

  for (const answer of correctAnswers.slice(0, 16)) {
    const expectedValue = typeof answer === 'string' ? answer : answer.value
    const expectedRaw = expectedValue.trim()
    if (expectedRaw.length === 0) continue

    const exactRawMatch =
      expectedRaw.localeCompare(actualRaw, undefined, { sensitivity: 'base' }) === 0
    if (exactRawMatch) return true

    const expected = normalizeAnswer(expectedRaw)
    if (expected.length === 0 || actual.length === 0) continue
    if (actual === expected || actual.includes(expected)) return true

    const maxDistance = maximumAnswerDistance(actual.length)
    if (
      maxDistance > 0 &&
      Math.abs(actual.length - expected.length) <= maxDistance &&
      levenshteinDistance(actual, expected) <= maxDistance
    )
      return true

    if (expected.length > actual.length) {
      actualWords ??= normalizedAnswerWords(actualRaw)
      if (distinctivePrefixMatches(expectedRaw, actual, actualWords)) return true
    }
  }
  return false
}

function distinctivePrefixMatches(
  expectedRaw: string,
  actual: string,
  actualWords: readonly string[]
): boolean {
  if (actualWords.length < 4 || actual.length < 16) return false

  const expectedWords = normalizedAnswerWords(expectedRaw)
  if (actualWords.length >= expectedWords.length) return false

  const expectedPrefix = expectedWords.slice(0, actualWords.length).join('')
  const maxDistance = maximumAnswerDistance(actual.length)
  return (
    Math.abs(actual.length - expectedPrefix.length) <= maxDistance &&
    levenshteinDistance(actual, expectedPrefix) <= maxDistance
  )
}

function normalizedAnswerWords(value: string): string[] {
  return normalizeAnswerText(value).match(/[\p{Letter}\p{Number}]+/gu) ?? []
}

function maximumAnswerDistance(length: number): number {
  return length > 10 ? 2 : length > 4 ? 1 : 0
}

export type RandomIndex = (maxExclusive: number) => number

export function shuffleCharacters(
  value: string,
  randomIndex: RandomIndex = secureRandomIndex
): string {
  const words = value.split(/(\s+)/u)
  return words.map((word) => (/^\s+$/u.test(word) ? word : shuffleWord(word, randomIndex))).join('')
}

function shuffleWord(value: string, randomIndex: RandomIndex): string {
  if (value.length < 2) return value
  const letters = Array.from(value)
  let shuffled = value
  for (let attempt = 0; attempt < 8 && shuffled === value; attempt += 1) {
    for (let index = letters.length - 1; index > 0; index -= 1) {
      const swapIndex = randomIndex(index + 1)
      ;[letters[index], letters[swapIndex]] = [letters[swapIndex]!, letters[index]!]
    }
    shuffled = letters.join('')
  }
  return shuffled
}

function secureRandomIndex(maxExclusive: number): number {
  return randomInt(maxExclusive)
}
