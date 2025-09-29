import type { URL } from 'node:url'
import type {
  AnyGuildChannel,
  ApplicationCommandOptionTypes,
  Attachment,
  AutocompleteInteraction,
  ChannelTypes,
  CommandInteraction,
  InteractionResolvedChannel,
  Member,
  Message,
  PermissionName,
  Role,
  User
} from 'oceanic.js'

export type OptionType =
  | 'String'
  | 'Integer'
  | 'Boolean'
  | 'User'
  | 'Channel'
  | 'Role'
  | 'Number'
  | 'Mentionable'
  | 'Attachment'
  | 'SubCommand'
  | 'Message'
  | 'Emoji'
  | 'Date'
  | 'Url'

interface _OptionDef<T extends OptionType> {
  type: T
  description?: string
  required?: boolean
  metadata?: Record<string, any>
}

interface ApplicationCommandOptionsChoice<
  T extends ApplicationCommandOptionTypes = ApplicationCommandOptionTypes
> {
  name: string
  value: T extends ApplicationCommandOptionTypes.STRING ? string
    : T extends
      | ApplicationCommandOptionTypes.INTEGER
      | ApplicationCommandOptionTypes.NUMBER ? number
    : unknown
}

interface _StringOptionDef {
  autocomplete?: boolean
  minLength?: number
  maxLength?: number
  choices?: Array<
    ApplicationCommandOptionsChoice<ApplicationCommandOptionTypes.STRING>
  >
}

interface _IntegerOptionDef {
  autocomplete?: boolean
  minValue?: number
  maxValue?: number
  choices?: Array<
    ApplicationCommandOptionsChoice<ApplicationCommandOptionTypes.INTEGER>
  >
}

interface _ChannelOptionDef {
  types: Array<
    | ChannelTypes.GUILD_TEXT
    | ChannelTypes.GUILD_VOICE
    | ChannelTypes.GUILD_CATEGORY
    | ChannelTypes.GUILD_ANNOUNCEMENT
    | ChannelTypes.ANNOUNCEMENT_THREAD
    | ChannelTypes.PUBLIC_THREAD
    | ChannelTypes.PRIVATE_THREAD
    | ChannelTypes.GUILD_STAGE_VOICE
    | ChannelTypes.GUILD_FORUM
    | ChannelTypes.GUILD_MEDIA
  >
}

interface _NumberOptionDef {
  autocomplete?: boolean
  minValue?: number
  maxValue?: number
  choices?: Array<
    ApplicationCommandOptionsChoice<ApplicationCommandOptionTypes.NUMBER>
  >
}

interface _SubCommandOptionDef {
  options?: Record<string, Exclude<OptionDef, SubCommandOptionDef>>
}

type StringOptionDef = _OptionDef<'String'> & _StringOptionDef
type IntegerOptionDef = _OptionDef<'Integer'> & _IntegerOptionDef
type BooleanOptionDef = _OptionDef<'Boolean'>
type UserOptionDef = _OptionDef<'User'>
type ChannelOptionDef = _OptionDef<'Channel'> & _ChannelOptionDef
type RoleOptionDef = _OptionDef<'Role'>
type NumberOptionDef = _OptionDef<'Number'> & _NumberOptionDef
type MentionableOptionDef = _OptionDef<'Mentionable'>
type AttachmentOptionDef = _OptionDef<'Attachment'>
type SubCommandOptionDef = _OptionDef<'SubCommand'> & _SubCommandOptionDef
type MessageOptionDef = _OptionDef<'Message'> & _StringOptionDef
type EmojiOptionDef = _OptionDef<'Emoji'> & _StringOptionDef
type DateOptionDef = _OptionDef<'Date'> & _StringOptionDef
type UrlOptionDef = _OptionDef<'Url'> & _StringOptionDef

type OptionDef =
  | StringOptionDef
  | IntegerOptionDef
  | BooleanOptionDef
  | UserOptionDef
  | ChannelOptionDef
  | RoleOptionDef
  | NumberOptionDef
  | MentionableOptionDef
  | AttachmentOptionDef
  | SubCommandOptionDef
  | MessageOptionDef
  | EmojiOptionDef
  | DateOptionDef
  | UrlOptionDef

export interface OptionsDef {
  [x: string]: OptionDef
}

export type ParsedOptionType =
  | string
  | number
  | boolean
  | User
  | AnyGuildChannel
  | InteractionResolvedChannel
  | Role
  | Member
  | Attachment
  | Message
  | Date
  | URL
  | null

type OptionTypeMap = {
  String: string
  Integer: number
  Boolean: boolean
  User: User
  Channel: AnyGuildChannel | InteractionResolvedChannel
  Role: Role
  Number: number
  Mentionable: Member
  Attachment: Attachment
  SubCommand: boolean
  Message: Message | null
  Emoji: string | null
  Date: Date | null
  Url: URL | null
}

type RequiredOptionValue<T extends OptionDef> = T['required'] extends false
  ? OptionTypeMap[T['type']] | null
  : OptionTypeMap[T['type']]

export type ParsedOptions<T extends OptionsDef = OptionsDef> = {
  [K in keyof T]: RequiredOptionValue<T[K]>
}

interface CommandContext<T extends OptionsDef = OptionsDef> {
  options: ParsedOptions<T>
}

export interface CommandConfig<T extends OptionsDef = OptionsDef> {
  id?: string
  name?: string
  description?: string
  category?: string
  options?: T
  nsfw?: boolean
  userPermissions?: PermissionName[]
  dm?: boolean
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void> | void
  preconditions?: string[]
}

export type CommandExecute<T extends OptionsDef = OptionsDef> = (
  interaction: CommandInteraction,
  context: CommandContext<T>
) => void

export type RosepackCommandInput = string | RosepackCommand

export interface RosepackCommand<T extends OptionsDef = OptionsDef> {
  config: CommandConfig<T>
  execute: CommandExecute<T>
}
