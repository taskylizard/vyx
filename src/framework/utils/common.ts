import { fileURLToPath } from 'node:url'
import { dirname } from 'pathe'

/**
 * Imports a module and returns its default export.
 *
 * @param {string} path - The path to the module.
 * @returns {Promise<T>} The default export of the module.
 */
export async function importDefault<T>(path: string): Promise<T> {
  return (
    (await import(path)) as {
      default: T
    }
  ).default
}

/**
 * Formats a duration in milliseconds into a human-readable string.
 *
 * @param {number | undefined} duration - The duration in
milliseconds.
 * @returns {string} The formatted duration string.
 */
export function formatDuration(duration: number | undefined): string {
  if (typeof duration === 'undefined') return '00:00'
  if (duration > 3600000000) return 'Live'

  let seconds: string | number = Number.parseInt(`${(duration / 1000) % 60}`)
  let minutes: string | number = Number.parseInt(
    `${(duration / (1000 * 60)) % 60}`
  )
  let hours: string | number = Number.parseInt(
    `${(duration / (1000 * 60 * 60)) % 24}`
  )

  hours = hours < 10 ? `0${hours}` : hours
  minutes = minutes < 10 ? `0${minutes}` : minutes
  seconds = seconds < 10 ? `0${seconds}` : seconds

  if (duration < 3600000) {
    return `${minutes}:${seconds}`
  }
  return `${hours}:${minutes}:${seconds}`
}

/**
 * Returns the directory name from a URL.
 *
 * @param {URL | string} url - The URL.
 * @returns {string} The directory name.
 */
export function getDirname(url: URL | string): string {
  return dirname(getFilename(url))
}

/**
 * Returns the file name from a URL.
 *
 * @param {URL | string} url - The URL.
 * @returns {string} The file name.
 */
export function getFilename(url: URL | string): string {
  return fileURLToPath(url)
}

/**
 * Truncates a string to a specified maximum length.
 *
 * @param {string} string - The string to truncate.
 * @param {number} maxLength - The maximum length.
 * @returns {string} The truncated string.
 */
export function truncateString(string: string, maxLength: number): string {
  return string.length > maxLength
    ? `${string.substring(0, maxLength)}…`
    : string
}

/**
 * Splits an array into chunks.
 *
 * @param {T[]} array - The array to split.
 * @param {number} chunkSize - The size of each chunk.
 * @returns {T[][]} The array of chunks.
 */
export function splitArray<T>(array: T[], chunkSize: number): T[][] {
  const _chunkSize = chunkSize - 1
  return array.reduce<T[][]>((resultArray, item, index) => {
    const chunkIndex = Math.floor(index / _chunkSize)
    resultArray[chunkIndex] ||= []
    resultArray[chunkIndex].push(item)
    return resultArray
  }, [])
}

export type Result<T, E extends string | Error = Error> =
  | { ok: true; result: T }
  | { ok: false; error: E }

export const emojis = [
  '🎊',
  '🎉',
  '🎈',
  '🎇',
  '🎆',
  '🎅',
  '🎄',
  '🎁',
  '🎀',
  '🎃',
  '🕺',
  '👻',
  '🤖',
  '🧙',
  '🧚',
  '🧛',
  '🧜',
  '🧟',
  '💇',
  '🚶',
  '🏃',
  '💃',
  '🕴',
  '🗣',
  '👤',
  '👥',
  '🤺',
  '🏇',
  '⛷',
  '🏂',
  '🏌',
  '🏄',
  '🚣',
  '🏊',
  '⛹',
  '🏋',
  '🌺',
  '🏕',
  '🏖',
  '🏗',
  '🏘',
  '🏙',
  '🏚',
  '🏛',
  '🏜'
]
