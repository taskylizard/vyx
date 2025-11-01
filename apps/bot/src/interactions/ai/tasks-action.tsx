/** @jsx h */
/** @jsxFrag Fragment */
import { defineInteraction, Embed } from '#framework'
import {
  ActionRow,
  Button,
  ButtonStyles,
  Section,
  StringOption,
  StringSelect,
  TextDisplay
} from '@packages/components-jsx'
import { h } from '@packages/components-jsx/jsx-runtime'
import type { AITask } from '@packages/database'
import { createMessage } from './shared'

export default defineInteraction({
  id: 'ai.tasks.action',
  type: 'selectMenu',
  async run(interaction, client) {
    await interaction.deferUpdate()

    const selectedValue = interaction.data.values.getStrings()[0]
    if (!selectedValue) {
      return await interaction.editOriginal(
        createMessage(<TextDisplay>No action selected.</TextDisplay>)
      )
    }

    switch (selectedValue) {
      case 'create':
        return await handleCreate(interaction, client)
      case 'list':
        return await handleList(interaction, client)
      case 'edit':
        return await handleEdit(interaction, client)
      case 'toggle':
        return await handleToggle(interaction, client)
      case 'delete':
        return await handleDelete(interaction, client)
      default:
        return await interaction.editOriginal(
          createMessage(<TextDisplay>Unknown action selected.</TextDisplay>)
        )
    }
  }
})

async function handleCreate(interaction: any, _client: any) {
  return await interaction.editOriginal(
    createMessage(
      <Section
        accessory={
          <Button customID='ai.tasks.create' style={ButtonStyles.PRIMARY}>
            Create Task
          </Button>
        }
      >
        <TextDisplay>
          Use the **Create Task** button to open the task creation form.
        </TextDisplay>
      </Section>
    )
  )
}

async function handleList(interaction: any, client: any) {
  const tasks = await client.prisma.aITask.findMany({
    where: {
      userId: interaction.user.id
    },
    orderBy: {
      createdAt: 'desc'
    }
  })

  if (tasks.length === 0) {
    return await interaction.editOriginal(
      createMessage(
        <TextDisplay>
          You don't have any AI tasks yet. Use the dropdown to create one!
        </TextDisplay>
      )
    )
  }

  let description = ''

  for (const task of tasks) {
    const status = task.isActive ? 'Active' : 'Inactive'
    const intervalText = task.intervalDays === 1
      ? 'daily'
      : `every ${task.intervalDays} days`
    const timezoneText = task.timezone ? ` (${task.timezone})` : ''

    description += `**${task.id}.** ${status}\n`
    description += `**Instructions:** ${
      task.instructions.length > 100
        ? task.instructions.substring(0, 100) + '...'
        : task.instructions
    }\n`
    description +=
      `**Schedule:** ${intervalText} at ${task.timeOfDay}${timezoneText}\n`
    description += `**Created:** <t:${
      Math.floor(
        task.createdAt.getTime() / 1000
      )
    }:R>\n\n`
  }

  description += `\nYou have ${
    tasks.filter((t: any) => t.isActive).length
  }/3 active tasks.\n\n`
  description +=
    '-# Select a task below to trigger it immediately for testing.\n'
  description += '-# Task will execute in ~5 seconds'

  return await interaction.editOriginal(
    createMessage(
      <>
        <TextDisplay>{description}</TextDisplay>
        <ActionRow>
          <StringSelect
            customID='ai.task.trigger'
            placeholder='Select a task to trigger immediately'
          >
            {tasks.map((task: AITask) => (
              <StringOption
                key={task.id}
                value={task.id.toString()}
                label={`Task ${task.id} - ${
                  task.isActive ? 'Active' : 'Inactive'
                }`}
                description={task.instructions.length > 100
                  ? task.instructions.substring(0, 97) + '...'
                  : task.instructions}
              />
            ))}
          </StringSelect>
        </ActionRow>
      </>
    )
  )
}

async function handleEdit(interaction: any, client: any) {
  const tasks = await client.prisma.aITask.findMany({
    where: {
      userId: interaction.user.id
    },
    orderBy: {
      createdAt: 'desc'
    }
  })

  if (tasks.length === 0) {
    return await interaction.editOriginal(
      createMessage(
        <TextDisplay>
          You don't have any tasks to edit. Use the dropdown to create one!
        </TextDisplay>
      )
    )
  }

  return await interaction.editOriginal(
    createMessage(
      <>
        <TextDisplay>Select a task to edit:</TextDisplay>
        <ActionRow>
          <StringSelect
            customID='ai.tasks.edit.select'
            placeholder='Select a task to edit'
          >
            {tasks.map((task: AITask) => (
              <StringOption
                key={task.id}
                value={task.id.toString()}
                label={`Task ${task.id}`}
                description={task.instructions.length > 100
                  ? task.instructions.substring(0, 97) + '...'
                  : task.instructions}
              />
            ))}
          </StringSelect>
        </ActionRow>
      </>
    )
  )
}

async function handleToggle(interaction: any, client: any) {
  const tasks = await client.prisma.aITask.findMany({
    where: {
      userId: interaction.user.id
    },
    orderBy: {
      createdAt: 'desc'
    }
  })

  if (tasks.length === 0) {
    return await interaction.editOriginal(
      createMessage(
        <TextDisplay>
          You don't have any tasks to toggle. Use the dropdown to create one!
        </TextDisplay>
      )
    )
  }

  return await interaction.editOriginal(
    createMessage(
      <>
        <TextDisplay>Select a task to toggle:</TextDisplay>
        <ActionRow>
          <StringSelect
            customID='ai.tasks.toggle.select'
            placeholder='Select a task to toggle'
          >
            {tasks.map((task: AITask) => (
              <StringOption
                key={task.id}
                value={task.id.toString()}
                label={`Task ${task.id} - ${
                  task.isActive ? 'Active' : 'Inactive'
                }`}
                description={task.instructions.length > 100
                  ? task.instructions.substring(0, 97) + '...'
                  : task.instructions}
              />
            ))}
          </StringSelect>
        </ActionRow>
      </>
    )
  )
}

async function handleDelete(interaction: any, client: any) {
  const tasks = await client.prisma.aITask.findMany({
    where: {
      userId: interaction.user.id
    },
    orderBy: {
      createdAt: 'desc'
    }
  })

  if (tasks.length === 0) {
    return await interaction.editOriginal(
      createMessage(
        <TextDisplay>
          You don't have any tasks to delete. Use the dropdown to create one!
        </TextDisplay>
      )
    )
  }

  return await interaction.editOriginal(
    createMessage(
      <>
        <TextDisplay>Select a task to delete:</TextDisplay>
        <ActionRow>
          <StringSelect
            customID='ai.tasks.delete.select'
            placeholder='Select a task to delete'
          >
            {tasks.map((task: AITask) => (
              <StringOption
                key={task.id}
                value={task.id.toString()}
                label={`Task ${task.id}`}
                description={task.instructions.length > 100
                  ? task.instructions.substring(0, 97) + '...'
                  : task.instructions}
              />
            ))}
          </StringSelect>
        </ActionRow>
      </>
    )
  )
}
