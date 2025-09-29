import { ActionRow, Button, SelectMenu, TextInput } from '@oceanicjs/builders'
import { ButtonStyles, ComponentTypes, TextInputStyles } from 'oceanic.js'
import { createError, useRosepack } from './rosepack'
import type { StringSelectMenuConfig } from './types'

export const getButton = (id: string) => {
  const rosepack = useRosepack()
  const button = rosepack.components.buttons.get(id)

  if (!button) return null
  const builder = new Button(
    button.config.style ?? ButtonStyles.PRIMARY,
    button.config.id!
  )
    .setLabel(button.config.label)

  if (button.config.emoji) {
    builder.setEmoji(button.config.emoji)
  }
  if (button.config.url) {
    builder.setURL(button.config.url)
  }
  if (button.config.disabled) {
    builder.disable()
  }

  return builder
}

export const getModal = (id: string) => {
  const rosepack = useRosepack()
  const modal = rosepack.components.modals.get(id)

  if (!modal) return null

  // For Oceanic.js, modals are handled differently - return a modal object
  const modalData = {
    id: modal.config.id!,
    title: modal.config.title,
    components: [] as any[]
  }

  if (modal.config.inputs) {
    for (const inputId in modal.config.inputs) {
      const input = modal.config.inputs[inputId]!
      const inputBuilder = new TextInput(
        input?.style ?? TextInputStyles.SHORT,
        input.label ?? inputId,
        inputId
      )
        .setRequired(input.required ?? true)

      if (input.minLength) {
        inputBuilder.minLength = input.minLength
      }

      if (input.maxLength) {
        inputBuilder.maxLength = input.maxLength
      }
      if (input.placeholder) {
        inputBuilder.setPlaceholder(input.placeholder)
      }
      if (input.value) {
        inputBuilder.setValue(input.value)
      }

      modalData.components.push(new ActionRow().addComponents(inputBuilder))
    }
  }

  return modalData
}

export const getSelectMenu = (id: string) => {
  const rosepack = useRosepack()
  const selectMenu = rosepack.components.selectMenus.get(id)

  if (!selectMenu) return null
  const { placeholder, type, disabled, minValues, maxValues } =
    selectMenu.config

  switch (type) {
    case 'String': {
      const config = selectMenu.config as StringSelectMenuConfig
      const builder = new SelectMenu(
        ComponentTypes.STRING_SELECT,
        selectMenu.config.id!
      )
        .setPlaceholder(placeholder || '')

      builder.disabled = disabled || false
      if (minValues) {
        builder.minValues = minValues
      }
      if (maxValues) {
        builder.maxValues = maxValues
      }

      if (config.options) {
        builder.addOptions(...config.options.map(option => ({
          label: option.label,
          value: option.value,
          description: option.description,
          emoji: option.emoji,
          default: option.default
        })))
      }

      return builder
    }
    case 'User': {
      const builder = new SelectMenu(ComponentTypes.USER_SELECT, id)
        .setPlaceholder(placeholder || '')

      builder.disabled = disabled || false
      if (minValues) {
        builder.minValues = minValues
      }
      if (maxValues) {
        builder.maxValues = maxValues
      }

      return builder
    }
    case 'Channel': {
      const builder = new SelectMenu(ComponentTypes.CHANNEL_SELECT, id)
        .setPlaceholder(placeholder || '')

      builder.disabled = disabled || false
      if (minValues) {
        builder.minValues = minValues
      }
      if (maxValues) {
        builder.maxValues = maxValues
      }

      return builder
    }
    case 'Role': {
      const builder = new SelectMenu(ComponentTypes.ROLE_SELECT, id)
        .setPlaceholder(placeholder || '')

      builder.disabled = disabled || false
      if (minValues) {
        builder.minValues = minValues
      }
      if (maxValues) {
        builder.maxValues = maxValues
      }

      return builder
    }
    case 'Mentionable': {
      const builder = new SelectMenu(ComponentTypes.MENTIONABLE_SELECT, id)
        .setPlaceholder(placeholder || '')

      builder.disabled = disabled || false
      if (minValues) {
        builder.minValues = minValues
      }
      if (maxValues) {
        builder.maxValues = maxValues
      }

      return builder
    }
    default:
      throw createError('Invalid select menu type')
  }
}
