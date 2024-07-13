import type { Constants } from 'oceanic.js';
import type { Context } from './context';

declare module 'oceanic.js' {
  interface ClientEvents {
    noPermissions: [ctx: Context, permissions: Constants.PermissionName[]];
    commandCooldown: [ctx: Context, secondsLeft: number];
    ownerOnlyCommand: [ctx: Context];
    guildOnlyCommand: [ctx: Context];
    commandSuccess: [ctx: Context];
    commandError: [ctx: Context, error: Error];
    commandCheckFail: [ctx: Context];
  }
}
