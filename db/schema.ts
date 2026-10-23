import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
export const rooms = sqliteTable('rooms', {id:text('id').primaryKey(),caseId:text('case_id').notNull(),hostHash:text('host_hash').notNull(),started:integer('started').notNull().default(0),createdAt:integer('created_at').notNull()});
export const roomMembers = sqliteTable('room_members', {roomId:text('room_id').notNull().references(()=>rooms.id),tokenHash:text('token_hash').notNull(),name:text('name').notNull(),game:text('game').notNull()},t=>[primaryKey({columns:[t.roomId,t.tokenHash]})]);
