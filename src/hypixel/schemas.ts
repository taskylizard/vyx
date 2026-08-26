import { z } from 'zod'

/**
 * Deliberately narrow views of the Hypixel API responses: only the fields the
 * Skyblock advisor consumes are modeled, everything else passes through
 * unvalidated so multi-megabyte inventory payloads stay cheap to parse.
 */

export const HypixelPlayerSchema = z.looseObject({
  achievements: z
    .looseObject({
      skyblock_experience: z.number().optional()
    })
    .optional(),
  achievementPoints: z.number().optional(),
  displayname: z.string().optional(),
  lastLogin: z.number().optional()
})

export type HypixelPlayer = z.infer<typeof HypixelPlayerSchema>

export const SkyblockMemberSchema = z.looseObject({
  crafted_generators: z.array(z.string()).max(600).optional(),
  dungeons: z
    .looseObject({
      dungeon_types: z
        .record(
          z.string(),
          z.looseObject({
            experience: z.number().optional(),
            highest_tier_completed: z.number().optional()
          })
        )
        .optional(),
      player_classes: z
        .record(z.string(), z.looseObject({ experience: z.number().optional() }))
        .optional(),
      secrets_found: z.number().optional(),
      selected_dungeon_class: z.string().optional()
    })
    .optional(),
  fairy_souls: z
    .looseObject({
      total_collected: z.number().optional()
    })
    .optional(),
  last_save: z.number().optional(),
  leveling: z
    .looseObject({
      experience: z.number().optional()
    })
    .optional(),
  mining_core: z
    .looseObject({
      experience: z.number().optional(),
      nodes: z.record(z.string(), z.number()).optional(),
      powders: z.record(z.string(), z.number()).optional()
    })
    .optional(),
  nether_island_player_data: z
    .looseObject({
      kuudra_completed_tiers: z.record(z.string(), z.number()).optional()
    })
    .optional(),
  pets_data: z
    .looseObject({
      pets: z
        .array(
          z.looseObject({
            exp: z.number(),
            tier: z.string(),
            type: z.string()
          })
        )
        .max(300)
        .optional()
    })
    .optional(),
  player_data: z
    .looseObject({
      accessory_bag: z
        .looseObject({
          highest_magical_power: z.number().optional()
        })
        .optional(),
      currency: z
        .looseObject({
          coin_purse: z.number().optional()
        })
        .optional(),
      experience: z.record(z.string(), z.number()).optional()
    })
    .optional(),
  slayer: z
    .looseObject({
      slayer_bosses: z
        .record(
          z.string(),
          z.looseObject({
            claimed_levels: z.record(z.string(), z.unknown()).optional(),
            xp: z.number().optional()
          })
        )
        .optional()
    })
    .optional()
})

export type SkyblockMember = z.infer<typeof SkyblockMemberSchema>

export const SkyblockProfileSchema = z.looseObject({
  banking: z
    .looseObject({
      balance: z.number()
    })
    .nullish(),
  cute_name: z.string().optional(),
  game_mode: z.string().nullish(),
  members: z.record(z.string(), SkyblockMemberSchema),
  profile_id: z.string(),
  selected: z.boolean().optional()
})

export type SkyblockProfile = z.infer<typeof SkyblockProfileSchema>

export const SkyblockProfilesResponseSchema = z.object({
  profiles: z.array(SkyblockProfileSchema).min(1)
})

export const SkillDefinitionSchema = z.looseObject({
  levels: z
    .array(
      z.object({
        level: z.number(),
        totalExpRequired: z.number()
      })
    )
    .min(1),
  maxLevel: z.number().optional(),
  name: z.string().optional()
})

export type SkillDefinition = z.infer<typeof SkillDefinitionSchema>

export const SkillsResourceSchema = z.object({
  skills: z.record(z.string(), SkillDefinitionSchema)
})

export const HypixelItemSchema = z.looseObject({
  category: z.string().optional(),
  id: z.string(),
  name: z.string().optional(),
  npc_sell_price: z.number().optional(),
  tier: z.string().optional()
})

export type HypixelItem = z.infer<typeof HypixelItemSchema>

export const ItemsResourceSchema = z.object({
  items: z.array(HypixelItemSchema).max(20_000)
})

export const BazaarOrderSchema = z.object({
  amount: z.number(),
  orders: z.number().optional(),
  pricePerUnit: z.number()
})

export type BazaarOrder = z.infer<typeof BazaarOrderSchema>

export const BazaarProductSchema = z.looseObject({
  buy_summary: z.array(BazaarOrderSchema).max(100).optional(),
  product_id: z.string(),
  quick_status: z
    .looseObject({
      buyMovingWeek: z.number().optional(),
      buyOrders: z.number().optional(),
      buyPrice: z.number().optional(),
      buyVolume: z.number().optional(),
      sellMovingWeek: z.number().optional(),
      sellOrders: z.number().optional(),
      sellPrice: z.number().optional(),
      sellVolume: z.number().optional()
    })
    .optional(),
  sell_summary: z.array(BazaarOrderSchema).max(100).optional()
})

export type BazaarProduct = z.infer<typeof BazaarProductSchema>

export const BazaarResponseSchema = z.object({
  products: z.record(z.string(), BazaarProductSchema)
})
