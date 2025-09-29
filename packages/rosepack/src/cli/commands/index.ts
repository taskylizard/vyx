import type { CommandDef } from 'citty'

const _default = (r: any) => (r.default || r) as Promise<CommandDef>

export const commands = {
  dev: () => import('./dev').then(_default),
  build: () => import('./build').then(_default),
  add: () => import('./add').then(_default),
  invite: () => import('./invite').then(_default)
} as const
