// tasky::max-comment-length - comments limited by word count
// Consecutive line comments form one group so a comment block cannot be dodged by splitting.
// JSDoc blocks and the file header are exempt.

import type { Context, Node } from '../../types.ts'

const MAX_WORDS = 50

interface Comment {
  end: number
  endLine: number
  node: Node
  start: number
  text: string
  type: string
}

interface CommentGroup {
  comments: Comment[]
  text: string
}

function stripCommentMarkers(text: string, type: string): string {
  if (type !== 'Block') return text
  return text
    .replace(/^\/\*\*?/, '')
    .replace(/\*\/$/, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\* ?/, ''))
    .join(' ')
}

function groupComments(comments: Comment[]): CommentGroup[] {
  const groups: CommentGroup[] = []

  for (const comment of comments) {
    if (comment.text.startsWith('#!')) continue

    const previous = groups.at(-1)
    const previousComment = previous?.comments.at(-1)
    const canJoin =
      comment.type === 'Line' &&
      previousComment !== undefined &&
      previousComment.type === 'Line' &&
      previousComment.endLine + 1 === comment.endLine

    if (previous !== undefined && canJoin) {
      previous.comments.push(comment)
      previous.text += ` ${comment.text}`
      continue
    }

    groups.push({ comments: [comment], text: comment.text })
  }

  return groups
}

function countWords(text: string): number {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/u).length : 0
}

function collectComments(context: Context): Comment[] {
  const sourceText = context.sourceCode.text
  return (context.sourceCode.getAllComments?.() ?? []).map((comment) => {
    const start = Number(comment.start ?? 0)
    return {
      node: comment,
      text: stripCommentMarkers(sourceText.slice(start, Number(comment.end ?? 0)), comment.type),
      type: comment.type,
      start,
      end: Number(comment.end ?? 0),
      endLine: comment.loc?.end.line ?? 0
    }
  })
}

export default {
  create(context: Context) {
    return {
      'Program:exit'(program: Node) {
        const groups = groupComments(collectComments(context))

        const firstToken = context.sourceCode.getFirstToken?.(program)
        const firstTokenStart = firstToken ? Number(firstToken.start) : null
        const header = groups.find(
          (group) =>
            firstTokenStart === null ||
            group.comments[group.comments.length - 1].end <= firstTokenStart
        )

        for (const group of groups) {
          if (group === header) continue
          const comment = group.comments[0]
          if (
            group.comments.length === 1 &&
            comment.type === 'Block' &&
            comment.text.startsWith('/**')
          ) {
            continue
          }

          const count = countWords(group.text)
          if (count <= MAX_WORDS) continue

          context.report({
            message: `Comment has ${count} words (maximum ${MAX_WORDS}). Keep only context the code cannot express. (tasky::max-comment-length)`,
            node: comment.node
          })
        }
      }
    }
  }
}
