import {
  bigint,
  doublePrecision,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp
} from 'drizzle-orm/pg-core'

export const Module = pgEnum('Module', ['REPORT', 'MUSIC', 'ECONOMY'])

export const ReportStatus = pgEnum('ReportStatus', ['OPEN', 'CLOSED'])

export const Config = pgTable('config', {
  guildId: bigint('guild_id', { mode: 'bigint' }).notNull().primaryKey(),
  reportsChannel: bigint('reports_channel', { mode: 'bigint' }),
  currency: text('currency'),
  modules: Module('modules').array().notNull()
})

export const Report = pgTable(
  'reports',
  {
    reportId: text('report_id').notNull(),
    guildId: bigint('guild_id', { mode: 'bigint' }).notNull(),
    createdMember: bigint('created_member', { mode: 'bigint' }).notNull(),
    reportedMember: bigint('reported_member', { mode: 'bigint' }).notNull(),
    reason: text('reason').notNull(),
    status: ReportStatus('status').notNull().default('OPEN'),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { precision: 3 })
  },
  (Report) => ({
    Report_cpk: primaryKey({
      name: 'Report_cpk',
      columns: [Report.reportId, Report.guildId]
    })
  })
)

export const Reminder = pgTable('Reminder', {
  id: serial('id').notNull().primaryKey(),
  userId: text('user_id').notNull(),
  createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
  time: timestamp('time', { precision: 3 }).notNull(),
  content: text('content').notNull(),
  messageLink: text('message_link').notNull(),
  reminderMessageId: text('reminder_message_id').unique()
})

export const EconomyProfile = pgTable(
  'economy',
  {
    guildId: bigint('guild_id', { mode: 'bigint' }).notNull(),
    userId: bigint('user_id', { mode: 'bigint' }).notNull(),
    walletBal: integer('wallet_bal').notNull(),
    bankBal: integer('bank_bal').notNull()
  },
  (EconomyProfile) => ({
    EconomyProfile_cpk: primaryKey({
      name: 'EconomyProfile_cpk',
      columns: [EconomyProfile.guildId, EconomyProfile.userId]
    })
  })
)

export const ShopItem = pgTable(
  'shop_items',
  {
    itemId: integer('item_id').notNull(),
    guildId: bigint('guild_id', { mode: 'bigint' }).notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    role: bigint('role', { mode: 'bigint' }),
    price: doublePrecision('price').notNull()
  },
  (ShopItem) => ({
    ShopItem_cpk: primaryKey({
      name: 'ShopItem_cpk',
      columns: [ShopItem.itemId, ShopItem.guildId]
    })
  })
)
