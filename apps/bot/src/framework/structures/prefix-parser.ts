type ArgumentType = 'string' | 'number' | 'quoted' | 'rest'

export type ArgumentDefinition = {
  type: ArgumentType
  required?: boolean
  defaultValue?: string | number
}

export type ArgumentsSchema = Record<string, ArgumentDefinition>

export type ParsedArguments<T extends ArgumentsSchema> = {
  [K in keyof T]: T[K]['required'] extends true
    ? T[K]['type'] extends 'number' ? number
    : string
    : T[K]['type'] extends 'number' ? number | undefined
    : string | undefined
}

export type Expect<T extends true> = T

export type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends
  (<T>() => T extends Y ? 1 : 2) ? true : false

export class ArgumentParser {
  private position = 0
  private input: string

  constructor(input: string) {
    this.input = input.trim()
  }

  private skipWhitespace(): void {
    while (this.position < this.input.length) {
      const char = this.input[this.position]
      if (!char || !/\s/.test(char)) break
      this.position++
    }
  }

  private parseQuoted(): string | null {
    const quote = this.input[this.position]
    if (quote !== '"' && quote !== "'" && quote !== '\u201C') {
      return null
    }

    this.position++
    let result = ''
    let escaped = false

    const closingQuote = quote === '\u201C' ? '\u201D' : quote

    while (this.position < this.input.length) {
      const char = this.input[this.position]

      if (escaped) {
        result += char
        escaped = false
        this.position++
        continue
      }

      if (char === '\\') {
        escaped = true
        this.position++
        continue
      }

      if (char === closingQuote) {
        this.position++
        return result
      }

      result += char
      this.position++
    }

    return result
  }

  private parseUnquoted(): string {
    let result = ''
    while (this.position < this.input.length) {
      const char = this.input[this.position]
      if (!char || /\s/.test(char)) break
      result += char
      this.position++
    }
    return result
  }

  private parseRest(): string {
    const result = this.input.slice(this.position)
    this.position = this.input.length
    return result
  }

  public parse<T extends ArgumentsSchema>(
    schema: T
  ): ParsedArguments<T> {
    const result: Record<string, string | number | undefined> = {}
    const entries = Object.entries(schema)

    for (const [name, def] of entries) {
      this.skipWhitespace()

      if (this.position >= this.input.length) {
        if (def.required) {
          throw new Error(`missing required argument: ${name}`)
        }
        result[name] = def.defaultValue
        continue
      }

      let value: string | number | undefined

      if (def.type === 'rest') {
        value = this.parseRest()
      } else if (def.type === 'quoted') {
        const quoted = this.parseQuoted()
        if (quoted !== null) {
          value = quoted
        } else {
          value = this.parseUnquoted()
        }
      } else {
        value = this.parseUnquoted()
      }

      if (!value && def.required) {
        throw new Error(`missing required argument: ${name}`)
      }

      if (def.type === 'number') {
        const num = Number(value)
        if (Number.isNaN(num)) {
          throw new Error(`invalid number for argument: ${name}`)
        }
        result[name] = num
      } else {
        result[name] = value || def.defaultValue
      }
    }

    return result as ParsedArguments<T>
  }

  public getRemainder(): string {
    this.skipWhitespace()
    return this.input.slice(this.position)
  }

  public hasMore(): boolean {
    this.skipWhitespace()
    return this.position < this.input.length
  }
}

export function parseArguments<T extends ArgumentsSchema>(
  input: string,
  schema: T
): ParsedArguments<T> {
  const parser = new ArgumentParser(input)
  return parser.parse(schema)
}
