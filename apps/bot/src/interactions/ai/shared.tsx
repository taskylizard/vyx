/** @jsx h */
/** @jsxFrag Fragment */
import {
  ActionRow,
  ComponentMessage,
  Container,
  Separator,
  StringOption,
  StringSelect,
  TextDisplay
} from '@packages/components-jsx'
import { h } from '@packages/components-jsx/jsx-runtime'
import type { AITask } from '@packages/database'
import { type Component, SeparatorSpacingSize } from 'oceanic.js'

export function createMessage(children: Component) {
  return (
    <ComponentMessage>
      <Container accentColor={0x5865f2}>
        {children}
        <Separator spacing={SeparatorSpacingSize.SMALL} divider={true} />
        <ActionRow>
          <StringSelect
            customID='ai.tasks.action'
            placeholder='Choose an action'
          >
            <StringOption
              value='create'
              label='Create Task'
              description='Create a new AI task'
            />
            <StringOption
              value='list'
              label='List Tasks'
              description='View all your tasks'
            />
            <StringOption
              value='edit'
              label='Edit Task'
              description='Modify an existing task'
            />
            <StringOption
              value='toggle'
              label='Toggle Task'
              description='Enable or disable a task'
            />
            <StringOption
              value='delete'
              label='Delete Task'
              description='Remove a task permanently'
            />
          </StringSelect>
        </ActionRow>
      </Container>
    </ComponentMessage>
  )
}
