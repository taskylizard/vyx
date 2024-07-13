import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'pathe';

/**
 * Imports a module and returns its default export.
 *
 * @param {string} path - The path to the module.
 * @returns {Promise<T>} The default export of the module.
 */
export async function importDefault<T>(path: string): Promise<T> {
  return (
    (await import(path)) as {
      default: T;
    }
  ).default;
}

/**
 * Runs a function and return the result and error in an array, similar to Golang error handling.
 *
 * @param cb Function to execute.
 * @returns Array with the result of the function and the error.
 */
export async function goErr<T>(cb: () => T): Promise<[Awaited<T>, Error]> {
  try {
    const val = await cb();
    return [val, undefined as unknown as Error];
  } catch (error) {
    return [undefined as unknown as Awaited<T>, error as Error];
  }
}

/**
 * Runs a function and return the result and error in an array, similar to Golang error handling.
 *
 * @param cb Function to execute.
 * @returns Array with the result of the function and the error.
 */
export function goErrSync<T>(cb: () => T): [T, Error] {
  try {
    const val = cb();
    return [val, undefined as unknown as Error];
  } catch (error) {
    return [undefined as unknown as T, error as Error];
  }
}

/**
 * Formats a duration in milliseconds into a human-readable string.
 *
 * @param {number | undefined} duration - The duration in
milliseconds.
 * @returns {string} The formatted duration string.
 */
export function formatDuration(duration: number | undefined): string {
  if (typeof duration === 'undefined') return '00:00';
  if (duration > 3600000000) return 'Live';

  let seconds: string | number = parseInt(`${(duration / 1000) % 60}`);
  let minutes: string | number = parseInt(`${(duration / (1000 * 60)) % 60}`);
  let hours: string | number = parseInt(
    `${(duration / (1000 * 60 * 60)) % 24}`
  );

  hours = hours < 10 ? `0${hours}` : hours;
  minutes = minutes < 10 ? `0${minutes}` : minutes;
  seconds = seconds < 10 ? `0${seconds}` : seconds;

  if (duration < 3600000) {
    return `${minutes}:${seconds}`;
  }
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Reads a directory's file paths recursively, filtering for `.js` and `.ts` files by default.
 *
 * @param dir Directory to read.
 * @returns Array of file paths.
 */
export function readPathsRecursively(
  dir: string,
  disableFilter = false
): string[] {
  return [
    ...new Set(
      readdirSync(dir)
        .filter((path) => (disableFilter ? true : /^.+(\.[jt]s)?$/.test(path)))
        .filter((file) => !file.includes('actions'))
        .map((path) => resolve(dir, path))
        .map((path) =>
          goErrSync(() => statSync(path).isDirectory())[0]
            ? readPathsRecursively(path)
            : [path]
        )
        // make sure directories are before files
        .sort((a, b) => (a.length > b.length ? -1 : 1))
        .flat()
    )
  ];
}

/**
 * Returns the directory name from a URL.
 *
 * @param {URL | string} url - The URL.
 * @returns {string} The directory name.
 */
export function getDirname(url: URL | string): string {
  return dirname(getFilename(url));
}

/**
 * Returns the file name from a URL.
 *
 * @param {URL | string} url - The URL.
 * @returns {string} The file name.
 */
export function getFilename(url: URL | string): string {
  return fileURLToPath(url);
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
    : string;
}

/**
 * Splits an array into chunks.
 *
 * @param {T[]} array - The array to split.
 * @param {number} chunkSize - The size of each chunk.
 * @returns {T[][]} The array of chunks.
 */
export function splitArray<T>(array: T[], chunkSize: number): T[][] {
  const _chunkSize = chunkSize - 1;
  return array.reduce<T[][]>((resultArray, item, index) => {
    const chunkIndex = Math.floor(index / _chunkSize);
    resultArray[chunkIndex] ||= [];
    resultArray[chunkIndex].push(item);
    return resultArray;
  }, []);
}
