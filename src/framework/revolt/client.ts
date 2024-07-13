import { Logger } from '@control.systems/logger';
import { Client, type ClientOptions } from 'revolt.js';

export class RevoltClient extends Client {
  /** If the bot is connected to the websocket */
  connected: boolean;
  /** Number (in milliseconds) since the bot is ready */
  uptime: number;
  log: Logger;

  public constructor(
    options: Partial<ClientOptions> = { autoReconnect: true, partials: true },
    clientName: string
  ) {
    super(options);
    this.log = new Logger(clientName);
    this.connected = false;
    this.uptime = 0;

    // biome-ignore lint/suspicious/noAssignInExpressions:rip bozo
    this.on('connected', () => (this.connected = true));
    this.on('ready', async () => this.startup());
    // this.on('message', async (m) => await this.message(m));
    this.on('disconnected', () =>
      this.log.warn('Client dropped, reconnecting...')
    );
  }

  private startup() {
    this.uptime = Date.now();
    this.log.info(`Logged in as ${this.user!.username}!`);
  }

  public async getUsersCount() {
    const membersSet = new Set();
    for await (const server of this.servers.values()) {
      const members = await server.fetchMembers();
      for (const member of members.members) {
        membersSet.add(member.id);
      }
    }
    return membersSet.size;
  }
}
