export type Server = {
  id: string
  name: string
  icon: string | null
  owner?: boolean
  permissions?: string
  features?: string[]
}

export type ServersResponse = {
  guilds: Server[]
}
