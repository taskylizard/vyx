// tasky::no-bullshit - inflated vocabulary and em dashes in comments
// Flags words from a blocklist of corporate slop, plus any em dash.
// Quotes and code spans inside a comment are ignored so quoting slop is not slop.

import type { Context } from '../../types.ts'

const JARGON_WORDS = [
  'utilize',
  'utilise',
  'leverage',
  'delve',
  'facilitate',
  'streamline',
  'seamless',
  'seamlessly',
  'robust',
  'comprehensive',
  'meticulous',
  'meticulously',
  'crucial',
  'pivotal',
  'myriad',
  'plethora',
  'paramount',
  'holistic',
  'multifaceted',
  'nuanced',
  'synergy',
  'bolster',
  'encompass',
  'endeavor',
  'endeavour',
  'aforementioned',
  'commence'
] as const

const SWAPS: Record<string, string> = {
  utilize: 'use',
  utilise: 'use',
  leverage: 'use',
  facilitate: 'help',
  streamline: 'simplify',
  comprehensive: 'complete',
  crucial: 'important',
  paramount: 'important',
  encompass: 'include',
  commence: 'start'
}

const SENTENCE_TERMINATORS = new Set(['.', '!', '?'])
const EM_DASH = '\u2014'

function escapeWord(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function toPattern(word: string): string {
  const base = escapeWord(word)
  const parts = [`${base}(?:s|es|d|ed|ing|ly|ally)?`]
  const last = word.slice(-1)
  if (last === 'e') parts.push(`${escapeWord(word.slice(0, -1))}(?:ing|ed|es)`)
  if (last === 'y') parts.push(`${escapeWord(word.slice(0, -1))}ies`)
  return parts.join('|')
}

function buildMatcher(words: string[]): RegExp | null {
  if (words.length === 0) return null
  return new RegExp(`\\b(?:${words.map(toPattern).join('|')})\\b`, 'giu')
}

function isQuoted(text: string, index: number): boolean {
  let backticks = 0
  let doubleQuotes = 0
  for (let i = 0; i < index; i++) {
    if (text[i] === '`') backticks++
    else if (text[i] === '"') doubleQuotes++
  }
  return backticks % 2 === 1 || doubleQuotes % 2 === 1
}

function getSentenceRange(text: string, index: number): { end: number; start: number } {
  let start = index
  while (start > 0) {
    const char = text[start - 1]
    if (char === '\n' || SENTENCE_TERMINATORS.has(char)) break
    start -= 1
  }

  let end = index + 1
  while (end < text.length) {
    const char = text[end]
    if (char === '\n') break
    end += 1
    if (SENTENCE_TERMINATORS.has(char)) break
  }

  while (start < index && /\s/.test(text[start])) start += 1
  while (end > index + 1 && /\s/.test(text[end - 1])) end -= 1

  return { end, start }
}

export default {
  create(context: Context) {
    const matcher = buildMatcher([...JARGON_WORDS])

    return {
      'Program:exit'() {
        const comments = context.sourceCode.getAllComments?.() ?? []
        for (const comment of comments) {
          const raw: string = comment.value ?? ''
          if (!raw) continue

          if (matcher) {
            matcher.lastIndex = 0
            for (let match = matcher.exec(raw); match; match = matcher.exec(raw)) {
              if (isQuoted(raw, match.index)) continue

              const swap = SWAPS[match[0].toLowerCase()]
              const hint = swap ? ` Use "${swap}" instead.` : ''
              context.report({
                message: `Avoid "${match[0]}" in comments. Prefer plainer wording a person would type.${hint} (tasky::no-bullshit)`,
                node: comment
              })
            }
          }

          for (
            let index = raw.indexOf(EM_DASH);
            index !== -1;
            index = raw.indexOf(EM_DASH, index + 1)
          ) {
            const sentence = getSentenceRange(raw, index)
            const preview = raw.slice(sentence.start, sentence.end).trim()
            context.report({
              message: `Avoid em dashes in comments. Rephrase this sentence with shorter, more natural wording: "${preview}" (tasky::no-bullshit)`,
              node: comment
            })
          }
        }
      }
    }
  }
}
