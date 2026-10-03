import { describe, expect, it } from 'vitest'

import { selectTasksToBringForward } from '@/features/routine/tasksToBringForward'
import type { RoutineTaskRow } from '@/features/routine/types'

const TODAY = '2026-10-03'

function buildTask(overrides: Partial<RoutineTaskRow> = {}): RoutineTaskRow {
    const baseTask: RoutineTaskRow = {
        id: 'task-1',
        user_id: 'user-1',
        title: 'Pagar boleto',
        scheduled_on: '2026-10-02',
        carried_from_on: null,
        category_id: null,
        is_important: false,
        completed_on: null,
        completed_at: null,
        sort_order: 0,
        created_at: '2026-09-30T08:00:00.000Z',
        updated_at: '2026-09-30T08:00:00.000Z',
    }
    return { ...baseTask, ...overrides }
}

function idsOf(tasks: RoutineTaskRow[]): string[] {
    return tasks.map((task) => task.id)
}

describe('selectTasksToBringForward', () => {
    it('inclui a tarefa de ontem e a de sete dias atrás', () => {
        const yesterday = buildTask({ id: 'yesterday', scheduled_on: '2026-10-02' })
        const weekAgo = buildTask({ id: 'week-ago', scheduled_on: '2026-09-26' })

        expect(idsOf(selectTasksToBringForward([yesterday, weekAgo], TODAY))).toEqual(['week-ago', 'yesterday'])
    })

    it('deixa de fora hoje, o futuro e o que é mais antigo que sete dias', () => {
        const today = buildTask({ id: 'today', scheduled_on: TODAY })
        const future = buildTask({ id: 'future', scheduled_on: '2026-10-04' })
        const tooOld = buildTask({ id: 'too-old', scheduled_on: '2026-09-25' })

        expect(selectTasksToBringForward([today, future, tooOld], TODAY)).toEqual([])
    })

    it('deixa de fora tarefa concluída e tarefa sem data', () => {
        const done = buildTask({ id: 'done', completed_at: '2026-10-02T20:00:00.000Z', completed_on: '2026-10-02' })
        const undated = buildTask({ id: 'undated', scheduled_on: null })

        expect(selectTasksToBringForward([done, undated], TODAY)).toEqual([])
    })

    it('ordena por dia de origem e, no mesmo dia, pela posição na lista', () => {
        const laterDay = buildTask({ id: 'later-day', scheduled_on: '2026-10-02', sort_order: 0 })
        const secondOfDay = buildTask({ id: 'second', scheduled_on: '2026-10-01', sort_order: 1 })
        const firstOfDay = buildTask({ id: 'first', scheduled_on: '2026-10-01', sort_order: 0 })

        expect(idsOf(selectTasksToBringForward([laterDay, secondOfDay, firstOfDay], TODAY))).toEqual([
            'first',
            'second',
            'later-day',
        ])
    })
})
