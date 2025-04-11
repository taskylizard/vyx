import { readFileSync } from 'node:fs'
import { parseTOML } from 'confbox'

interface PropInfoType {
  type: 'number' | 'string' | 'array' | 'boolean' | 'object'
}

interface PropInfoParser {
  parser: (input: unknown) => unknown
}

interface PropInfoOptional {
  optional?: boolean
}

interface PropInfoDefault {
  default?: unknown
}

interface PropInfoChoices {
  choices?: readonly unknown[]
}

export type ConfigSchema = Record<string, PropInfo>

interface PropInfoNested {
  properties?: ConfigSchema
}

type PropInfo = (PropInfoType | PropInfoParser) &
  PropInfoOptional &
  PropInfoDefault &
  PropInfoChoices &
  PropInfoNested

interface MappedPropType<Choice> {
  string: Choice extends (infer U)[] ? U : string
  number: Choice extends (infer U)[] ? U : number
  boolean: boolean
  array: unknown[]
  object: Record<string, unknown>
}

type Mutable<T> = { -readonly [P in keyof T]: T[P] }

/**
 * Type resolution for property info with proper nested type inference
 */
type GetPropTypeInner<T extends PropInfo> = T extends PropInfoParser
  ? ReturnType<T['parser']>
  : T extends { type: 'object'; properties: infer P }
    ? P extends ConfigSchema
      ? ConfigType<P>
      : Record<string, unknown>
    : T extends PropInfoType
      ? MappedPropType<Mutable<T['choices']>>[T['type']]
      : never

type GetPropTypeOptional<T extends PropInfo> = T extends PropInfoDefault
  ? T['default']
  : undefined

type GetPropType<T extends PropInfo> = T extends PropInfoOptional
  ? GetPropTypeInner<T> | GetPropTypeOptional<T>
  : GetPropTypeInner<T>

export type ConfigType<T extends ConfigSchema> = {
  [K in keyof T]: GetPropType<T[K]>
}

interface CustomTomlError {
  path: string
  value: unknown
  error: unknown
  kind: 'custom'
}

interface ChoiceTomlError {
  path: string
  value: unknown
  expected: readonly unknown[]
  kind: 'choice'
}

interface TypeTomlError {
  path: string
  value: unknown
  expectedType: string
  kind: 'type'
}

interface MissingTomlError {
  path: string
  kind: 'missing'
}

type TomlError =
  | CustomTomlError
  | ChoiceTomlError
  | TypeTomlError
  | MissingTomlError

/**
 * Options for parsing TOML
 */
export interface TomlOptions {
  /** The path to the TOML file to parse */
  filePath?: string
  /** Raw TOML content to parse instead of a file */
  content?: string
}

/**
 * Validates a value against the provided property info
 */
function validateValue(
  path: string,
  value: unknown,
  propInfo: PropInfo,
  errors: TomlError[]
): unknown {
  // Handle missing values
  if (value === undefined) {
    if ('default' in propInfo) {
      return propInfo.default
    }
    if (!propInfo.optional) {
      errors.push({ path, kind: 'missing' })
    }
    return undefined
  }

  if ('parser' in propInfo) {
    try {
      return propInfo.parser(value)
    } catch (error) {
      errors.push({ path, value, kind: 'custom', error })
      return undefined
    }
  }

  if (propInfo.choices && !propInfo.choices.includes(value)) {
    errors.push({ path, value, kind: 'choice', expected: propInfo.choices })
    return undefined
  }

  // Type validation and conversion
  if ('type' in propInfo) {
    switch (propInfo.type) {
      case 'string':
        if (typeof value !== 'string') {
          errors.push({ path, value, expectedType: 'string', kind: 'type' })
          return undefined
        }
        return value

      case 'number':
        if (typeof value !== 'number') {
          // Try to convert if a string is provided
          if (typeof value === 'string') {
            const numberValue = Number(value)
            if (!Number.isNaN(numberValue)) {
              return numberValue
            }
          }
          errors.push({ path, value, expectedType: 'number', kind: 'type' })
          return undefined
        }
        return value

      case 'boolean':
        if (typeof value !== 'boolean') {
          // Try to convert if a string is provided
          if (typeof value === 'string') {
            if (value.toLowerCase() === 'true' || value === '1') {
              return true
            }
            if (value.toLowerCase() === 'false' || value === '0') {
              return false
            }
          }
          errors.push({ path, value, expectedType: 'boolean', kind: 'type' })
          return undefined
        }
        return value

      case 'array':
        if (!Array.isArray(value)) {
          // Try to convert if a string is provided
          if (typeof value === 'string') {
            return value.split(/, ?/gu)
          }
          errors.push({ path, value, expectedType: 'array', kind: 'type' })
          return undefined
        }
        return value

      case 'object':
        if (
          typeof value !== 'object' ||
          value === null ||
          Array.isArray(value)
        ) {
          errors.push({ path, value, expectedType: 'object', kind: 'type' })
          return undefined
        }

        // If nested properties are defined, validate them
        if (propInfo.properties) {
          return validateConfig(
            propInfo.properties,
            value as Record<string, unknown>,
            errors,
            path
          )
        }

        return value
    }
  }

  // If no type validation, return as is
  return value
}

function validateConfig<T extends ConfigSchema>(
  schema: T,
  data: Record<string, unknown>,
  errors: TomlError[] = [],
  basePath = ''
): ConfigType<T> {
  const config: Record<string, unknown> = {}

  for (const [key, propInfo] of Object.entries(schema)) {
    const path = basePath ? `${basePath}.${key}` : key
    const value = data[key]

    config[key] = validateValue(path, value, propInfo, errors)
  }

  return config as ConfigType<T>
}

export function createConfig<const T extends ConfigSchema>(
  schema: T,
  options: TomlOptions
): ConfigType<T> {
  let rawData: unknown

  // Parse the TOML content or file
  if (options.content) {
    rawData = parseTOML(options.content)
  } else if (options.filePath) {
    const content = readFileSync(options.filePath, 'utf-8')
    rawData = parseTOML(content)
  } else {
    throw new TypeError('Either filePath or content must be provided')
  }

  // Validate data is an object
  if (typeof rawData !== 'object' || rawData === null) {
    throw new TypeError('Parsed TOML content is not an object')
  }

  const errors: TomlError[] = []
  const config = validateConfig(
    schema,
    rawData as Record<string, unknown>,
    errors
  )

  // Handle validation errors
  if (errors.length !== 0) {
    let message = 'The following TOML configuration values are invalid:\n'

    for (const error of errors) {
      switch (error.kind) {
        case 'missing':
          message += `  ${error.path} (missing)\n`
          break
        case 'type':
          message += `  ${error.path}: ${JSON.stringify(error.value)} (expected ${error.expectedType})\n`
          break
        case 'choice':
          message += `  ${error.path}: ${JSON.stringify(error.value)} (expected one of ${error.expected.join(', ')})\n`
          break
        case 'custom':
          message += `  ${error.path}: ${JSON.stringify(error.value)} (${error.error})\n`
          break
      }
    }
    throw new TypeError(message)
  }

  return config
}
