import type { Weekday, Workout, WorkoutPlan } from '@/lib/workoutPlanSchema'

export type WorkoutSuggestion =
    | { kind: 'single'; workout: Workout }
    | { kind: 'choose_one'; workouts: Workout[] }
    | { kind: 'no_schedule'; availableWorkouts: Workout[] }

export function suggestWorkoutForWeekday(
    plan: WorkoutPlan,
    weekday: Weekday,
): WorkoutSuggestion {
    const scheduledWorkouts = plan.treinos.filter((workout) =>
        (workout.dias_semana ?? []).includes(weekday),
    )

    if (scheduledWorkouts.length === 1) {
        return { kind: 'single', workout: scheduledWorkouts[0] }
    }

    if (scheduledWorkouts.length > 1) {
        return { kind: 'choose_one', workouts: scheduledWorkouts }
    }

    return { kind: 'no_schedule', availableWorkouts: plan.treinos }
}

export function findWorkoutById(plan: WorkoutPlan, workoutId: string): Workout | undefined {
    const matchingWorkout = plan.treinos.find((workout) => workout.id === workoutId)

    return matchingWorkout
}
