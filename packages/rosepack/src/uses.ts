import {
  ActionRow,
  Button,
  EmbedBuilder,
  SelectMenu
} from '@oceanicjs/builders'
import type { Stream } from 'node:stream'

import { camelCase, kebabCase } from 'scule'
import { getButton, getModal, getSelectMenu } from './getters'
import { useRosepack } from './rosepack'
import type { EmbedOptions } from './types'

export const useRuntimeEnv = (): Record<string, string | undefined> => {
  const rosepack = useRosepack()
  const env = Object.entries(process.env).reduce(
    (acc, [key, value]) => {
      if (/^(HMX_)/.test(key) && value) {
        const _key = kebabCase(key.replace('HMX_', ''))

        acc[camelCase(_key)] = value
      }
      return acc
    },
    {} as Record<string, string | undefined>
  )

  return { ...rosepack.options.env, ...env }
}

export const useButtons = () => {
  const { components } = useRosepack()

  return components.buttons.reduce(
    (acc, button) => {
      if (button.config.id) {
        acc[button.config.id] = getButton(button.config.id) ?? undefined
      }
      return acc
    },
    {} as Record<string, Button | undefined>
  )
}

export const useModals = () => {
  const { components } = useRosepack()

  return components.modals.reduce(
    (acc, modal) => {
      if (modal.config.id) {
        acc[modal.config.id] = getModal(modal.config.id) ?? undefined
      }
      return acc
    },
    {} as Record<string, any | undefined>
  )
}

export const useSelectMenus = () => {
  const { components } = useRosepack()

  return components.selectMenus.reduce(
    (acc, selectMenu) => {
      if (selectMenu.config.id) {
        acc[selectMenu.config.id] = getSelectMenu(selectMenu.config.id) ??
          undefined
      }
      return acc
    },
    {} as Record<string, SelectMenu | undefined>
  )
}

export const useActionRow = (
  ...components: (Button | SelectMenu | undefined)[]
): ActionRow => {
  const actionRow = new ActionRow()
  const validComponents = components.filter(c => c) as (Button | SelectMenu)[]
  return actionRow.addComponents(...validComponents)
}

export const useEmbed = (options: EmbedOptions) => {
  const builder = new EmbedBuilder()

  if (options.color) {
    builder.setColor(Number(options.color))
  }
  if (options.title) {
    builder.setTitle(options.title)
  }
  if (options.url) {
    builder.setURL(options.url)
  }
  if (options.author) {
    builder.setAuthor(
      options.author.name,
      options.author.iconURL,
      options.author.url
    )
  }
  if (options.description) {
    builder.setDescription(options.description)
  }
  if (options.thumbnail) {
    builder.setThumbnail(options.thumbnail)
  }
  if (options.image) {
    builder.setImage(options.image)
  }
  if (options.timestamp) {
    const timestamp = options.timestamp === true
      ? new Date()
      : typeof options.timestamp === 'number'
      ? new Date(options.timestamp)
      : options.timestamp
    builder.setTimestamp(timestamp)
  }
  if (options.footer) {
    builder.setFooter(options.footer.text, options.footer.iconURL || '')
  }
  if (options.fields) {
    builder.addFields(...options.fields)
  }

  return builder
}

export const useAttachment = (args: Buffer | string | Stream) => {
  // Oceanic.js uses file objects for attachments
  return { file: args, name: 'file' }
}
