import { relations } from 'drizzle-orm';
import { user } from './auth';
import { equipments, exerciseMuscles, exercises, muscleGroups } from './exercises';
import { bodyMeasurements, userSettings, userStats } from './profile';
import { friendLinks, shareLinks, userFriends } from './social';
import { workoutExercises, workouts, workoutSets } from './workouts';

export const userRelations = relations(user, ({ one, many }) => ({
  stats: one(userStats, { fields: [user.id], references: [userStats.userId] }),
  settings: one(userSettings, { fields: [user.id], references: [userSettings.userId] }),
  bodyMeasurements: many(bodyMeasurements),
  workouts: many(workouts),
  friendLinks: many(friendLinks),
}));

export const userStatsRelations = relations(userStats, ({ one }) => ({
  user: one(user, { fields: [userStats.userId], references: [user.id] }),
}));

export const userSettingsRelations = relations(userSettings, ({ one }) => ({
  user: one(user, { fields: [userSettings.userId], references: [user.id] }),
}));

export const bodyMeasurementsRelations = relations(bodyMeasurements, ({ one }) => ({
  user: one(user, { fields: [bodyMeasurements.userId], references: [user.id] }),
}));

export const equipmentsRelations = relations(equipments, ({ many }) => ({
  exercises: many(exercises),
}));

export const muscleGroupsRelations = relations(muscleGroups, ({ many }) => ({
  exerciseMuscles: many(exerciseMuscles),
}));

export const exercisesRelations = relations(exercises, ({ one, many }) => ({
  equipment: one(equipments, { fields: [exercises.equipmentId], references: [equipments.id] }),
  muscles: many(exerciseMuscles),
  workoutExercises: many(workoutExercises),
}));

export const exerciseMusclesRelations = relations(exerciseMuscles, ({ one }) => ({
  exercise: one(exercises, { fields: [exerciseMuscles.exerciseId], references: [exercises.id] }),
  muscleGroup: one(muscleGroups, {
    fields: [exerciseMuscles.muscleGroupId],
    references: [muscleGroups.id],
  }),
}));

export const workoutsRelations = relations(workouts, ({ one, many }) => ({
  owner: one(user, { fields: [workouts.ownerId], references: [user.id] }),
  originWorkout: one(workouts, {
    fields: [workouts.originWorkoutId],
    references: [workouts.id],
    relationName: 'clones',
  }),
  clones: many(workouts, { relationName: 'clones' }),
  exercises: many(workoutExercises),
  shareLinks: many(shareLinks),
}));

export const workoutExercisesRelations = relations(workoutExercises, ({ one, many }) => ({
  workout: one(workouts, { fields: [workoutExercises.workoutId], references: [workouts.id] }),
  exercise: one(exercises, { fields: [workoutExercises.exerciseId], references: [exercises.id] }),
  sets: many(workoutSets),
}));

export const workoutSetsRelations = relations(workoutSets, ({ one }) => ({
  workoutExercise: one(workoutExercises, {
    fields: [workoutSets.workoutExerciseId],
    references: [workoutExercises.id],
  }),
}));

export const userFriendsRelations = relations(userFriends, ({ one }) => ({
  user: one(user, { fields: [userFriends.userId], references: [user.id], relationName: 'user' }),
  friend: one(user, {
    fields: [userFriends.friendId],
    references: [user.id],
    relationName: 'friend',
  }),
}));

export const shareLinksRelations = relations(shareLinks, ({ one }) => ({
  workout: one(workouts, { fields: [shareLinks.workoutId], references: [workouts.id] }),
  creator: one(user, { fields: [shareLinks.createdBy], references: [user.id] }),
}));

export const friendLinksRelations = relations(friendLinks, ({ one }) => ({
  user: one(user, { fields: [friendLinks.userId], references: [user.id] }),
}));
