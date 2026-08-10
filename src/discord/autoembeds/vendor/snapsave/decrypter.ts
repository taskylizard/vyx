export function decryptSnapSave(data: string): string {
  return extractSnapSaveHTML(decodeSnapApp(getEncodedArguments(data)))
}

export function extractSnapSaveHTML(decoded: string): string {
  const errorMessage = decoded
    .split('document.querySelector("#alert").innerHTML = "')[1]
    ?.split('";')[0]
    ?.trim()
  if (errorMessage) {
    throw new Error(errorMessage)
  }

  const html = decoded
    .split('getElementById("download-section").innerHTML = "')[1]
    ?.split('"; document.getElementById("inputData").remove(); ')[0]
  if (!html) {
    throw new Error('SnapSave returned an unsupported response')
  }
  return html.replace(/\\(\\)?/gu, '')
}

function decodeSnapApp(args: Array<string>): string {
  const [encoded, , alphabet, offsetRaw, baseRaw] = args
  if (!encoded || !alphabet || !offsetRaw || !baseRaw) {
    throw new Error('SnapSave returned an unsupported response')
  }
  const offset = Number(offsetRaw)
  const base = Number(baseRaw)
  let result = ''

  for (let index = 0; index < encoded.length; ) {
    let segment = ''
    while (index < encoded.length && encoded[index] !== alphabet[base]) {
      segment += encoded[index]
      index += 1
    }
    index += 1
    for (let alphabetIndex = 0; alphabetIndex < alphabet.length; alphabetIndex += 1) {
      segment = segment.replaceAll(alphabet[alphabetIndex] ?? '', String(alphabetIndex))
    }
    result += String.fromCodePoint(decodeNumber(segment, base, 10) - offset)
  }

  try {
    const bytes = new Uint8Array(Array.from(result, (character) => character.codePointAt(0) ?? 0))
    return new TextDecoder().decode(bytes)
  } catch {
    return result
  }
}

function decodeNumber(value: string, sourceBase: number, targetBase: number): number {
  const characters = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/'.split('')
  const sourceCharacters = characters.slice(0, sourceBase)
  const targetCharacters = characters.slice(0, targetBase)
  let number = value
    .split('')
    .toReversed()
    .reduce((total, character, index) => {
      const characterIndex = sourceCharacters.indexOf(character)
      return characterIndex === -1 ? total : total + characterIndex * sourceBase ** index
    }, 0)
  let decoded = ''
  while (number > 0) {
    decoded = targetCharacters[number % targetBase] + decoded
    number = Math.floor(number / targetBase)
  }
  return Number(decoded || '0')
}

function getEncodedArguments(data: string): Array<string> {
  const encoded = data.split('decodeURIComponent(escape(r))}(')[1]?.split('))')[0]
  if (!encoded) {
    throw new Error('SnapSave returned an unsupported response')
  }
  return encoded.split(',').map((value) => value.replaceAll('"', '').trim())
}
