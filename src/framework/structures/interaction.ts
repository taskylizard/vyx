import type {
  AnyTextableGuildChannel,
  ComponentInteraction,
  ComponentTypes,
  ModalSubmitInteraction,
  SelectMenuTypes
} from 'oceanic.js';
import type { Client } from '../client';

type InteractionType = 'modal' | 'button' | 'selectMenu';

type SerializeType<T extends InteractionType> = T extends 'modal'
  ? ModalSubmitInteraction
  : T extends 'button'
    ? ComponentInteraction<ComponentTypes.BUTTON, AnyTextableGuildChannel>
    : T extends 'selectMenu'
      ? ComponentInteraction<SelectMenuTypes, AnyTextableGuildChannel>
      : never;

/**
 * Represents an interaction with specific permissions and a run method.
 * @template T - The type of interaction.
 */
export type Interaction<T extends InteractionType> = {
  /**
   * The unique identifier for the interaction.
   */
  id: string;
  type: T;
  /**
   * The function to run when the interaction is executed.
   * @param {T} interaction - The interaction instance.
   * @param {Client} client - The client instance.
   * @returns {Promise<unknown>} A promise that resolves when the interaction is executed.
   */
  run: (interaction: SerializeType<T>, client: Client) => Promise<unknown>;
};

/**
 * Defines an interaction with the given options.
 * @template T - The type of interaction.
 * @param {Interaction<T>} options - The options for the interaction.
 * @returns {Interaction<T>} The defined interaction.
 */
export function defineInteraction<T extends InteractionType>(
  options: Interaction<T>
): Interaction<T> {
  return options;
}
