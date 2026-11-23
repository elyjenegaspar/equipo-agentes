import { pgTable, uuid, text, integer, timestamp } from "drizzle-orm/pg-core";

export const runs = pgTable("runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  request: text("request").notNull(),
  status: text("status").notNull().default("en_curso"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").notNull().references(() => runs.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  assignee: text("assignee").notNull(), // develop | testing
  status: text("status").notNull().default("pendiente"), // pendiente | en_curso | fallida | aprobada
  attempt: integer("attempt").notNull().default(0),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").notNull().references(() => runs.id),
  taskId: uuid("task_id").references(() => tasks.id),
  agent: text("agent").notNull(), // orquestador | develop | testing
  message: text("message").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const artifacts = pgTable("artifacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").notNull().references(() => runs.id),
  path: text("path").notNull(),
  content: text("content").notNull(),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});