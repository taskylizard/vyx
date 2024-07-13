type StringResolvable = string | string[] | any;
type SplitOptions = {
  maxLength?: number;
  char?: string;
  prepend?: string;
  append?: string;
};

/**
 * Splits a string into multiple chunks at a designated character that do not exceed a specific length.
 * @param {StringResolvable} string Content to split
 * @param {SplitOptions} [options] Options controlling the behavior of the split
 * @returns {string[]}
 */
export function splitMessage(
  string: StringResolvable,
  {
    maxLength = 2000,
    char = '\n',
    prepend = '',
    append = ''
  }: SplitOptions = {}
): string[] {
  const text = resolveString(string);
  if (text.length <= maxLength) return [text];
  const splitText = text.split(char);
  if (splitText.some((chunk: string | any[]) => chunk.length > maxLength))
    throw new RangeError('SPLIT_MAX_LEN');
  const messages = [];
  let msg = '';
  for (const chunk of splitText) {
    if (msg && (msg + char + chunk + append).length > maxLength) {
      messages.push(msg + append);
      msg = prepend;
    }
    msg += (msg && msg !== prepend ? char : '') + chunk;
  }
  return messages.concat(msg).filter((message) => message);
}

export function resolveString(data: StringResolvable) {
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) return data.join('\n');
  return String(data);
}
