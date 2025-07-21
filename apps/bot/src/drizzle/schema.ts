import { relations } from 'drizzle-orm'
import {
  bigint,
  boolean,
  doublePrecision,
  foreignKey,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex
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

export const User = pgTable(
  'user',
  {
    id: text('id').notNull().primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('emailVerified').notNull(),
    image: text('image'),
    createdAt: timestamp('createdAt', { precision: 3 }).notNull(),
    updatedAt: timestamp('updatedAt', { precision: 3 }).notNull(),
    role: text('role'),
    banned: boolean('banned'),
    banReason: text('banReason'),
    banExpires: timestamp('banExpires', { precision: 3 })
  },
  (User) => ({
    User_email_unique_idx: uniqueIndex('User_email_key').on(User.email)
  })
)

export const Session = pgTable(
  'session',
  {
    id: text('id').notNull().primaryKey(),
    expiresAt: timestamp('expiresAt', { precision: 3 }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('createdAt', { precision: 3 }).notNull(),
    updatedAt: timestamp('updatedAt', { precision: 3 }).notNull(),
    ipAddress: text('ipAddress'),
    userAgent: text('userAgent'),
    userId: text('userId').notNull(),
    impersonatedBy: text('impersonatedBy')
  },
  (Session) => ({
    session_user_fkey: foreignKey({
      name: 'session_user_fkey',
      columns: [Session.userId],
      foreignColumns: [User.id]
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    Session_token_unique_idx: uniqueIndex('Session_token_key').on(Session.token)
  })
)

export const Account = pgTable(
  'account',
  {
    id: text('id').notNull().primaryKey(),
    accountId: text('accountId').notNull(),
    providerId: text('providerId').notNull(),
    userId: text('userId').notNull(),
    accessToken: text('accessToken'),
    refreshToken: text('refreshToken'),
    idToken: text('idToken'),
    accessTokenExpiresAt: timestamp('accessTokenExpiresAt', { precision: 3 }),
    refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt', { precision: 3 }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('createdAt', { precision: 3 }).notNull(),
    updatedAt: timestamp('updatedAt', { precision: 3 }).notNull()
  },
  (Account) => ({
    account_user_fkey: foreignKey({
      name: 'account_user_fkey',
      columns: [Account.userId],
      foreignColumns: [User.id]
    })
      .onDelete('cascade')
      .onUpdate('cascade')
  })
)

export const Verification = pgTable('verification', {
  id: text('id').notNull().primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt', { precision: 3 }).notNull(),
  createdAt: timestamp('createdAt', { precision: 3 }),
  updatedAt: timestamp('updatedAt', { precision: 3 })
})

export const UserRelations = relations(User, ({ many }) => ({
  sessions: many(Session, {
    relationName: 'SessionToUser'
  }),
  accounts: many(Account, {
    relationName: 'AccountToUser'
  })
}))

export const SessionRelations = relations(Session, ({ one }) => ({
  user: one(User, {
    relationName: 'SessionToUser',
    fields: [Session.userId],
    references: [User.id]
  })
}))

export const AccountRelations = relations(Account, ({ one }) => ({
  user: one(User, {
    relationName: 'AccountToUser',
    fields: [Account.userId],
    references: [User.id]
  })
}))
