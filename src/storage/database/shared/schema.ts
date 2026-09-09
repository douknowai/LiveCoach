import { sql } from "drizzle-orm"
import { pgTable, varchar, text, timestamp, integer, jsonb, uuid, index, serial } from "drizzle-orm/pg-core"

// 系统健康检查表（保留，禁止删除）
export const healthCheck = pgTable("health_check", {
  id: serial().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

/**
 * 训练会话表：一次模拟直播训练 = 一条记录
 * 明细数据（提醒/环节/转写/视觉抽查）以 jsonb 存储，由后端 API 读写
 */
export const trainingSessions = pgTable(
  "training_sessions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    student_name: varchar("student_name", { length: 64 }),
    task_type: varchar("task_type", { length: 32 }).notNull(),
    topic: text("topic"),
    product: text("product"),
    persona: text("persona"),
    audience: text("audience"),
    outline: text("outline"),
    script: text("script"),
    duration_sec: integer("duration_sec").notNull().default(0),
    overall_score: integer("overall_score"),
    metrics: jsonb("metrics"),
    summary: jsonb("summary"),
    reminders: jsonb("reminders"),
    reminder_stats: jsonb("reminder_stats"),
    stage_timeline: jsonb("stage_timeline"),
    speech_segments: jsonb("speech_segments"),
    vision_checks: jsonb("vision_checks"),
    /** 个性化配置快照（教练风格/学员画像/主攻维度） */
    learner_profile: jsonb("learner_profile"),
    /** 综合分时间采样（时间轴回放曲线用） */
    metric_samples: jsonb("metric_samples"),
    status: varchar("status", { length: 16 }).notNull().default("completed"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("training_sessions_created_at_idx").on(table.created_at),
    index("training_sessions_task_type_idx").on(table.task_type),
    index("training_sessions_status_idx").on(table.status),
  ],
)

export type TrainingSession = typeof trainingSessions.$inferSelect
export type NewTrainingSession = typeof trainingSessions.$inferInsert
