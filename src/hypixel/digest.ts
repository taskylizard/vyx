import { formatCompact } from '../shared/numbers.ts'
import type { HypixelPlayer, SkillDefinition, SkyblockMember, SkyblockProfile } from './schemas.ts'

export interface OverviewDigestInput {
  /** The configured player, used for the display name and XP fallbacks. */
  player: HypixelPlayer
  playerUUID: string
  profile: SkyblockProfile
  skillDefinitions: Record<string, SkillDefinition> | undefined
  /** The profile member matching the configured UUID, when shared publicly. */
  member: SkyblockMember | undefined
}

/** Cumulative XP thresholds per level for every skill, keyed by resource key. */
export type SkillThresholdTable = Map<string, number[]>

const MAX_DIGEST_PETS = 3

export function buildSkillThresholdTable(
  definitions: Record<string, SkillDefinition>
): SkillThresholdTable {
  const table = new Map<string, number[]>()
  for (const [key, definition] of Object.entries(definitions)) {
    const thresholds = [...definition.levels]
      .toSorted((first, second) => first.level - second.level)
      .map((level) => level.totalExpRequired)

    if (thresholds.length > 0) table.set(key, thresholds)
  }
  return table
}

export function skillProgress(
  xp: number,
  thresholds: readonly number[]
): { cap: number; level: number; xpForNextLevel: number; xpIntoLevel: number } {
  let level = 0
  while (level < thresholds.length && thresholds[level] <= xp) level += 1

  const cap = thresholds.length
  if (level >= cap) {
    const lastThreshold = thresholds[cap - 1] ?? 0
    return { cap, level: cap, xpForNextLevel: 0, xpIntoLevel: Math.max(0, xp - lastThreshold) }
  }

  const previousThreshold = level === 0 ? 0 : thresholds[level - 1]
  return {
    cap,
    level,
    xpForNextLevel: thresholds[level] - previousThreshold,
    xpIntoLevel: Math.max(0, xp - previousThreshold)
  }
}

/** Builds a compact Markdown snapshot of the configured player's Skyblock state. */
export function buildOverviewDigest(input: OverviewDigestInput): string {
  const { member, player, playerUUID, profile, skillDefinitions } = input
  const lines: string[] = []

  const headerParts = [
    bold(player.displayname ?? playerUUID),
    `profile ${bold(profile.cute_name ?? profile.profile_id)}`,
    profile.selected ? 'selected' : undefined,
    profile.game_mode ?? undefined,
    member?.last_save === undefined ? undefined : `saved ${isoDate(member.last_save)}`
  ].filter((part) => part !== undefined)
  lines.push(headerParts.join(' · '))

  if (member === undefined) {
    lines.push('')
    lines.push('Member data is unavailable — the player likely has API sharing disabled.')
    return lines.join('\n')
  }

  const skyblockXp = member.leveling?.experience ?? player.achievements?.skyblock_experience
  if (skyblockXp !== undefined) lines.push(`SkyBlock XP: ${formatCompact(skyblockXp)}`)

  const bankBalance = profile.banking?.balance
  const purse = member.player_data?.currency?.coin_purse
  const walletParts = [
    bankBalance === undefined ? undefined : `Bank: ${formatCompact(bankBalance)} coins`,
    purse === undefined ? undefined : `Purse: ${formatCompact(purse)} coins`
  ].filter((part) => part !== undefined)
  if (walletParts.length > 0) lines.push(walletParts.join(' · '))

  const fairySouls = member.fairy_souls?.total_collected
  if (fairySouls !== undefined) lines.push(`Fairy souls: ${fairySouls}`)

  const magicalPower = member.player_data?.accessory_bag?.highest_magical_power
  if (magicalPower !== undefined) lines.push(`Magical power: ${magicalPower}`)

  const skillLine = buildSkillLine(member.player_data?.experience, skillDefinitions)
  if (skillLine !== undefined) lines.push(`Skills: ${skillLine}`)

  const slayerLine = buildSlayerLine(member.slayer?.slayer_bosses)
  if (slayerLine !== undefined) lines.push(`Slayer: ${slayerLine}`)

  lines.push(...buildDungeonLines(member.dungeons))

  const hotmLine = buildHotmLine(member.mining_core)
  if (hotmLine !== undefined) lines.push(hotmLine)

  lines.push(...buildPetLines(member.pets_data?.pets))
  lines.push(...buildMiscLines(member))

  return lines.join('\n')
}

function buildSkillLine(
  experience: Readonly<Record<string, number>> | undefined,
  definitions: Record<string, SkillDefinition> | undefined
): string | undefined {
  if (experience === undefined) return undefined

  const thresholds = definitions === undefined ? undefined : buildSkillThresholdTable(definitions)
  const parts: string[] = []

  for (const [key, xp] of Object.entries(experience)) {
    if (!key.startsWith('SKILL_')) continue
    const name = titleCase(key.slice('SKILL_'.length))
    const table = thresholds?.get(key.slice('SKILL_'.length))

    if (table === undefined) {
      parts.push(`${name} ${formatCompact(xp)} xp`)
      continue
    }

    const progress = skillProgress(xp, table)
    parts.push(
      progress.level >= progress.cap
        ? `${name} ${progress.level}`
        : `${name} ${progress.level}/${progress.cap}`
    )
  }

  return parts.length === 0 ? undefined : parts.join(', ')
}

type SlayerBosses = NonNullable<NonNullable<SkyblockMember['slayer']>['slayer_bosses']>

function buildSlayerLine(bosses: SlayerBosses | undefined): string | undefined {
  if (bosses === undefined) return undefined

  const bossesWithXp = Object.entries(bosses).flatMap(([key, value]) =>
    typeof value.xp === 'number' ? [{ key, xp: value.xp }] : []
  )
  if (bossesWithXp.length === 0) return undefined

  return bossesWithXp
    .toSorted((first, second) => second.xp - first.xp)
    .map(({ key, xp }) => `${titleCase(key)} ${formatCompact(xp)} xp`)
    .join(', ')
}

interface DungeonData {
  dungeon_types?: Record<string, { experience?: number; highest_tier_completed?: number }>
  player_classes?: Record<string, { experience?: number }>
  secrets_found?: number
  selected_dungeon_class?: string
}

function buildDungeonLines(dungeons: DungeonData | undefined): string[] {
  if (dungeons === undefined) return []
  const lines: string[] = []

  const types = dungeons.dungeon_types ?? {}
  for (const [key, data] of Object.entries(types)) {
    if (data.experience === undefined && data.highest_tier_completed === undefined) continue

    const parts = [`${titleCase(key)}: ${formatCompact(data.experience ?? 0)} xp`]
    const highestTier = data.highest_tier_completed
    if (highestTier !== undefined && highestTier >= 0) parts.push(`best tier ${highestTier}`)
    lines.push(parts.join(' · '))
  }

  const selectedClass = dungeons.selected_dungeon_class
  const classes = Object.entries(dungeons.player_classes ?? {}).flatMap(([key, value]) =>
    value.experience === undefined
      ? []
      : [
          {
            isSelected: key === selectedClass,
            label: titleCase(key),
            xp: formatCompact(value.experience)
          }
        ]
  )
  if (classes.length > 0) {
    // tasky: stable sort floats the selected class to the front without reordering the rest
    const ordered = classes.toSorted(
      (first, second) => Number(second.isSelected) - Number(first.isSelected)
    )
    lines.push(`Classes: ${ordered.map(({ label, xp }) => `${label} ${xp}`).join(', ')}`)
  }

  if (dungeons.secrets_found !== undefined) lines.push(`Secrets found: ${dungeons.secrets_found}`)
  return lines
}

interface MiningCore {
  experience?: number
  nodes?: Record<string, number>
  powders?: Record<string, number>
}

function buildHotmLine(core: MiningCore | undefined): string | undefined {
  if (core === undefined) return undefined

  const parts: string[] = []
  const hotmTier = core.nodes?.special
  if (hotmTier !== undefined) parts.push(`tier ${hotmTier}`)
  if (core.experience !== undefined) parts.push(`${formatCompact(core.experience)} xp`)

  const powders = Object.entries(core.powders ?? {})
    .filter((entry) => entry[1] !== 0)
    .map(([key, value]) => `${titleCase(key)} ${formatCompact(value)}`)
  if (powders.length > 0) parts.push(powders.join(', '))

  return parts.length === 0 ? undefined : `Heart of the Mountain: ${parts.join(' · ')}`
}

interface Pet {
  exp: number
  tier: string
  type: string
}

function buildPetLines(pets: readonly Pet[] | undefined): string[] {
  if (pets === undefined || pets.length === 0) return []

  const top = [...pets]
    .toSorted((first, second) => second.exp - first.exp)
    .slice(0, MAX_DIGEST_PETS)
  const summary = top.map((pet) => `${titleCase(pet.type)} (${pet.tier.toLowerCase()})`)
  return [`Pets (${pets.length}): ${summary.join(', ')}`]
}

function buildMiscLines(member: SkyblockMember): string[] {
  const lines: string[] = []

  const minionCount = new Set(member.crafted_generators ?? []).size
  if (minionCount > 0) lines.push(`Unique minions crafted: ${minionCount}`)

  const kuudraTiers = member.nether_island_player_data?.kuudra_completed_tiers
  if (kuudraTiers !== undefined) {
    const completions = Object.values(kuudraTiers)
      .filter((value) => Number.isFinite(value))
      .reduce((total, value) => total + value, 0)
    if (completions > 0) lines.push(`Kuudra completions: ${formatCompact(completions)}`)
  }

  return lines
}

function isoDate(timestampMs: number): string {
  const date = new Date(timestampMs)
  return Number.isNaN(date.getTime()) ? String(timestampMs) : date.toISOString().slice(0, 10)
}

function bold(value: string): string {
  return `**${value}**`
}

function titleCase(value: string): string {
  const lowered = value.toLowerCase()
  return lowered.replace(/(^|[\s_])([a-z])/gu, (_, separator: string, letter: string) =>
    separator === '' ? letter.toUpperCase() : ` ${letter.toUpperCase()}`
  )
}
