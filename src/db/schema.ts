import { relations } from 'drizzle-orm';
import { integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const trips = pgTable('trips', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull(),
  destination: text('destination').notNull(),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  budgetAmount: text('budget_amount'),
  travelers: integer('travelers'),
  travelStyle: text('travel_style'),
  category: text('category'),
  itineraryData: text('itinerary_data'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  trips: many(trips),
}));

export const tripsRelations = relations(trips, ({ one }) => ({
  author: one(users, {
    fields: [trips.userId],
    references: [users.uid],
  }),
}));
