import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  completeOnboardingInputSchema,
  logWeightInputSchema,
  userSettingsInputSchema,
  userStatsInputSchema,
} from '@buddy-pass/shared';
import { desc, eq, schema, type Database } from '@buddy-pass/db';
import type { DbOrTx } from '../../services/workouts';
import { authedProcedure, router } from '../trpc';

const { userStats, userSettings, bodyMeasurements } = schema;

// DOB is stored as a calendar date (no timezone); crosses the wire as a Date at UTC midnight.
// Age is always computed from it — never stored, never returned as a field.
const toDateOnly = (d: Date) => d.toISOString().slice(0, 10);

function toStatsOutput(row: typeof userStats.$inferSelect | undefined) {
  if (!row) return null;
  return {
    heightCm: row.heightCm,
    gender: row.gender,
    dateOfBirth: row.dateOfBirth ? new Date(`${row.dateOfBirth}T00:00:00.000Z`) : null,
  };
}

function toSettingsOutput(row: typeof userSettings.$inferSelect | undefined) {
  if (!row) return null;
  return {
    unitPreference: row.unitPreference,
    experienceLevel: row.experienceLevel,
    defaultWorkoutVisibility: row.defaultWorkoutVisibility,
  };
}

const toWeighInOutput = (row: typeof bodyMeasurements.$inferSelect) => ({
  id: row.id,
  weightKg: row.weightKg,
  measuredAt: row.measuredAt,
});

async function getProfile(
  db: DbOrTx,
  user: {
    id: string;
    name: string;
    email: string;
    image?: string | null;
    isAnonymous?: boolean | null;
  },
) {
  const [stats] = await db.select().from(userStats).where(eq(userStats.userId, user.id));
  const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, user.id));
  const [latest] = await db
    .select()
    .from(bodyMeasurements)
    .where(eq(bodyMeasurements.userId, user.id))
    .orderBy(desc(bodyMeasurements.measuredAt))
    .limit(1);
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image ?? null,
      isAnonymous: Boolean(user.isAnonymous),
    },
    // nulls = onboarding incomplete
    stats: toStatsOutput(stats),
    settings: toSettingsOutput(settings),
    latestWeighIn: latest ? toWeighInOutput(latest) : null,
  };
}

async function upsertStats(
  db: Database,
  userId: string,
  input: Partial<z.infer<typeof userStatsInputSchema>>,
) {
  const patch = {
    ...(input.heightCm !== undefined ? { heightCm: input.heightCm } : {}),
    ...(input.gender !== undefined ? { gender: input.gender } : {}),
    ...(input.dateOfBirth !== undefined ? { dateOfBirth: toDateOnly(input.dateOfBirth) } : {}),
  };
  if (Object.keys(patch).length === 0) {
    const [row] = await db.select().from(userStats).where(eq(userStats.userId, userId));
    return toStatsOutput(row);
  }
  const [row] = await db
    .insert(userStats)
    .values({ userId, ...patch })
    .onConflictDoUpdate({ target: userStats.userId, set: patch })
    .returning();
  return toStatsOutput(row);
}

async function upsertSettings(
  db: Database,
  userId: string,
  input: Partial<z.infer<typeof userSettingsInputSchema>>,
) {
  const patch = {
    ...(input.unitPreference !== undefined ? { unitPreference: input.unitPreference } : {}),
    ...(input.experienceLevel !== undefined ? { experienceLevel: input.experienceLevel } : {}),
    ...(input.defaultWorkoutVisibility !== undefined
      ? { defaultWorkoutVisibility: input.defaultWorkoutVisibility }
      : {}),
  };
  if (Object.keys(patch).length === 0) {
    const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
    return toSettingsOutput(row);
  }
  const [row] = await db
    .insert(userSettings)
    .values({ userId, ...patch })
    .onConflictDoUpdate({ target: userSettings.userId, set: patch })
    .returning();
  return toSettingsOutput(row);
}

export const profileRouter = router({
  get: authedProcedure.query(({ ctx }) => getProfile(ctx.db, ctx.user)),

  /** One transaction: stats + settings + first weigh-in. Partial onboarding cannot exist. */
  completeOnboarding: authedProcedure
    .input(completeOnboardingInputSchema)
    .mutation(async ({ ctx, input }) => {
      await ctx.db.transaction(async (tx) => {
        const statsPatch = {
          heightCm: input.stats.heightCm,
          gender: input.stats.gender,
          dateOfBirth: toDateOnly(input.stats.dateOfBirth),
        };
        await tx
          .insert(userStats)
          .values({ userId: ctx.user.id, ...statsPatch })
          .onConflictDoUpdate({ target: userStats.userId, set: statsPatch });
        await tx
          .insert(userSettings)
          .values({ userId: ctx.user.id, ...input.settings })
          .onConflictDoUpdate({ target: userSettings.userId, set: input.settings });
        await tx.insert(bodyMeasurements).values({ userId: ctx.user.id, weightKg: input.weightKg });
      });
      return getProfile(ctx.db, ctx.user);
    }),

  updateStats: authedProcedure
    .input(userStatsInputSchema.partial())
    .mutation(({ ctx, input }) => upsertStats(ctx.db, ctx.user.id, input)),

  updateSettings: authedProcedure
    .input(userSettingsInputSchema.partial())
    .mutation(({ ctx, input }) => upsertSettings(ctx.db, ctx.user.id, input)),

  logWeight: authedProcedure.input(logWeightInputSchema).mutation(async ({ ctx, input }) => {
    const [row] = await ctx.db
      .insert(bodyMeasurements)
      .values({
        userId: ctx.user.id,
        weightKg: input.weightKg,
        measuredAt: input.measuredAt ?? new Date(),
      })
      .returning();
    return toWeighInOutput(row!);
  }),

  deleteWeighIn: authedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select()
        .from(bodyMeasurements)
        .where(eq(bodyMeasurements.id, input.id));
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' });
      if (row.userId !== ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN' });
      await ctx.db.delete(bodyMeasurements).where(eq(bodyMeasurements.id, input.id));
    }),
});
