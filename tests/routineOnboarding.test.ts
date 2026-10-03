import { describe, expect, it } from 'vitest'

import {
    buildOnboardingItems,
    greetingNameFromEmail,
    workoutWeekdaysFromPlan,
    type OnboardingChoice,
} from '@/features/routine/onboardingItems'
import type { Weekday, WorkoutPlan } from '@/lib/workoutPlanSchema'

const BUSINESS_DAYS: Weekday[] = ['segunda', 'terca', 'quarta', 'quinta', 'sexta']
const EVERY_DAY: Weekday[] = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo']

function planWithWorkoutDays(daysPerWorkout: (Weekday[] | undefined)[]): WorkoutPlan {
    const plan = {
        treinos: daysPerWorkout.map((dias_semana, index) => ({ id: `t${index}`, nome: `T${index}`, dias_semana })),
    } as unknown as WorkoutPlan
    return plan
}

describe('buildOnboardingItems', () => {
    it('recusa mais de 3 escolhas', () => {
        const choices: OnboardingChoice[] = [
            { kind: 'preset', presetId: 'creatine' },
            { kind: 'preset', presetId: 'water' },
            { kind: 'preset', presetId: 'stretch' },
            { kind: 'preset', presetId: 'reading' },
        ]

        expect(() => buildOnboardingItems(choices, { workoutWeekdays: BUSINESS_DAYS })).toThrow()
    })

    it('aceita 3 escolhas e mantém a ordem escolhida', () => {
        const choices: OnboardingChoice[] = [
            { kind: 'preset', presetId: 'stretch' },
            { kind: 'preset', presetId: 'creatine' },
            { kind: 'preset', presetId: 'water' },
        ]

        const rows = buildOnboardingItems(choices, { workoutWeekdays: BUSINESS_DAYS })

        expect(rows.map((row) => [row.title, row.sort_order])).toEqual([
            ['Alongar', 0],
            ['Creatina', 1],
            ['Beber 2 L de água', 2],
        ])
    })

    it('Academia usa os dias de treino do contexto e o vínculo do treino', () => {
        const rows = buildOnboardingItems([{ kind: 'preset', presetId: 'workout' }], {
            workoutWeekdays: ['segunda', 'quarta', 'sexta'],
        })

        expect(rows[0]).toMatchObject({
            title: 'Academia',
            link_kind: 'workout_finished',
            weekdays: ['segunda', 'quarta', 'sexta'],
        })
    })

    it('Registrar peso cai na segunda e Registrar sono em todos os dias', () => {
        const rows = buildOnboardingItems(
            [
                { kind: 'preset', presetId: 'body_weight' },
                { kind: 'preset', presetId: 'sleep' },
            ],
            { workoutWeekdays: BUSINESS_DAYS },
        )

        expect(rows[0]).toMatchObject({ link_kind: 'body_weight', weekdays: ['segunda'] })
        expect(rows[1]).toMatchObject({ link_kind: 'sleep', weekdays: EVERY_DAY })
    })

    it('hábito comum fica sem vínculo e em todos os dias', () => {
        const rows = buildOnboardingItems([{ kind: 'preset', presetId: 'reading' }], { workoutWeekdays: BUSINESS_DAYS })

        expect(rows[0]).toMatchObject({ title: 'Ler 10 minutos', link_kind: null, weekdays: EVERY_DAY })
    })

    it('escrita livre vira item sem vínculo, em todos os dias, com o texto aparado', () => {
        const rows = buildOnboardingItems([{ kind: 'custom', title: '  Regar as plantas ' }], {
            workoutWeekdays: BUSINESS_DAYS,
        })

        expect(rows[0]).toEqual({ title: 'Regar as plantas', link_kind: null, weekdays: EVERY_DAY, sort_order: 0 })
    })
})

describe('workoutWeekdaysFromPlan', () => {
    it('une os dias dos treinos na ordem da semana', () => {
        const plan = planWithWorkoutDays([['quinta', 'segunda'], ['quarta'], ['segunda']])

        expect(workoutWeekdaysFromPlan(plan)).toEqual(['segunda', 'quarta', 'quinta'])
    })

    it('sem plano usa segunda a sexta', () => {
        expect(workoutWeekdaysFromPlan(null)).toEqual(BUSINESS_DAYS)
    })

    it('plano sem dias declarados usa segunda a sexta', () => {
        expect(workoutWeekdaysFromPlan(planWithWorkoutDays([undefined, []]))).toEqual(BUSINESS_DAYS)
    })
})

describe('greetingNameFromEmail', () => {
    it('usa a parte antes do @ com a primeira letra maiúscula', () => {
        expect(greetingNameFromEmail('gustavo@exemplo.com')).toBe('Gustavo')
    })

    it('sem e-mail devolve null', () => {
        expect(greetingNameFromEmail(undefined)).toBeNull()
        expect(greetingNameFromEmail('')).toBeNull()
        expect(greetingNameFromEmail('@exemplo.com')).toBeNull()
    })
})
