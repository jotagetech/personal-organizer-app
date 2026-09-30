import { describe, expect, it } from 'vitest'

import type { DoneSet, ExerciseRecords, PlannedSet } from '@/features/evolution/metrics/exerciseStats'
import {
    formatAlsoRecordedAs,
    formatDoneText,
    formatMainRecord,
    formatPlanText,
    formatRecordLines,
    formatDropText,
    formatRecordsScopeNotice,
    formatSessionsLine,
    formatUnreadableSessions,
} from '@/features/evolution/metrics/exerciseText'

const EMPTY_RECORDS: ExerciseRecords = {
    metric: 'repeticoes',
    formaCarga: 'total',
    hasOtherLoadForm: false,
    maxLoad: null,
    maxReps: null,
    maxBallast: null,
    minAssistance: null,
    bestOneRepMax: null,
    bestVolume: null,
    maxDuration: null,
    maxDistance: null,
}

const DONE: DoneSet = { metric: 'repeticoes', loadKg: 40, reps: 10, durationSeconds: null, distanceM: null }
const PLANNED: PlannedSet = { metric: 'repeticoes', targetMin: 8, targetMax: 10, suggestedLoadKg: 37.5 }

describe('formatSessionsLine', () => {
    it('mostra a contagem e a data da última', () => {
        expect(formatSessionsLine(12, '2026-09-28')).toBe('12 sessões · última 28/09')
        expect(formatSessionsLine(1, '2026-09-28')).toBe('1 sessão · última 28/09')
    })
})

describe('formatMainRecord', () => {
    it('formata a maior carga e o maior tempo', () => {
        expect(formatMainRecord({ kind: 'maxLoad', formaCarga: 'total', value: 62.5, date: '2026-09-01' })).toBe('Maior carga: 62,5 kg')
        expect(formatMainRecord({ kind: 'maxDuration', formaCarga: 'total', value: 55, date: '2026-09-01' })).toBe('Maior tempo: 55 s')
    })

    it('devolve nulo sem recorde', () => {
        expect(formatMainRecord(null)).toBeNull()
    })
})

describe('formatRecordLines', () => {
    it('lista só os recordes que existem, com a data', () => {
        const records: ExerciseRecords = {
            ...EMPTY_RECORDS,
            maxLoad: { value: 50, date: '2026-08-10' },
            bestOneRepMax: { value: 58.3333, date: '2026-08-10' },
            bestVolume: { value: 700, date: '2026-08-03' },
        }

        expect(formatRecordLines(records)).toEqual([
            'Maior carga: 50 kg (10/08)',
            'Melhor 1RM estimado: 58,3 kg (10/08)',
            'Maior volume numa sessão: 700 kg (03/08)',
        ])
        expect(formatRecordLines(null)).toEqual([])
    })
})

describe('formatAlsoRecordedAs', () => {
    it('junta os nomes anteriores e some quando não há', () => {
        expect(formatAlsoRecordedAs(['Agacho', 'Squat'])).toBe('Também registrado como: Agacho, Squat')
        expect(formatAlsoRecordedAs([])).toBeNull()
    })
})

describe('feito e planejado', () => {
    it('mostra o feito e o planejado com a sugestão', () => {
        expect(formatDoneText(DONE, 'total', false)).toBe('40 kg × 10 reps')
        expect(formatPlanText(PLANNED, 'total', false)).toBe('(meta 8 a 10 reps, sugestão 37,5 kg)')
    })

    it('omite a sugestão quando o plano não tinha carga', () => {
        expect(formatPlanText({ ...PLANNED, suggestedLoadKg: null }, 'total', false)).toBe('(meta 8 a 10 reps)')
    })

    it('omite o planejado quando o snapshot não tinha a série', () => {
        expect(formatPlanText(null, 'total', false)).toBeNull()
    })

    it('diz a unidade nas séries de tempo', () => {
        const done: DoneSet = { metric: 'tempo', loadKg: null, reps: null, durationSeconds: 40, distanceM: null }
        const planned: PlannedSet = { metric: 'tempo', targetMin: 30, targetMax: 45, suggestedLoadKg: null }

        expect(formatDoneText(done, 'peso_corporal', false)).toBe('40 s')
        expect(formatPlanText(planned, 'peso_corporal', false)).toBe('(meta 30 a 45 s)')
    })
})

describe('recordes por forma de carga', () => {
    it('formata cada valor com a forma de carga', () => {
        const perSide: ExerciseRecords = {
            ...EMPTY_RECORDS,
            formaCarga: 'por_lado',
            maxLoad: { value: 30, date: '2026-08-10' },
        }
        const bodyweight: ExerciseRecords = {
            ...EMPTY_RECORDS,
            formaCarga: 'peso_corporal',
            maxReps: { value: 15, date: '2026-08-10' },
            maxBallast: { value: 5, date: '2026-08-10' },
            bestVolume: { value: 40, date: '2026-08-03' },
        }
        const assisted: ExerciseRecords = {
            ...EMPTY_RECORDS,
            formaCarga: 'assistencia',
            minAssistance: { value: 20, date: '2026-08-10' },
        }
        const unassisted: ExerciseRecords = { ...assisted, minAssistance: { value: 0, date: '2026-08-10' } }

        expect(formatRecordLines(perSide)).toEqual(['Maior carga: 30 kg por lado (10/08)'])
        expect(formatRecordLines(bodyweight)).toEqual([
            'Mais repetições numa série: 15 reps (10/08)',
            'Maior lastro: +5 kg (10/08)',
            'Maior volume numa sessão: 40 reps (03/08)',
        ])
        expect(formatRecordLines(assisted)).toEqual(['Menor assistência: assist. 20 kg (10/08)'])
        expect(formatRecordLines(unassisted)).toEqual(['Menor assistência: sem assistência (10/08)'])
    })

    it('avisa quando o exercício já teve outra forma de carga', () => {
        const mixed: ExerciseRecords = { ...EMPTY_RECORDS, formaCarga: 'por_halter', hasOtherLoadForm: true }

        expect(formatRecordsScopeNotice(mixed)).toBe('Recordes só das sessões em carga por halter')
        expect(formatRecordsScopeNotice(EMPTY_RECORDS)).toBeNull()
        expect(formatRecordsScopeNotice(null)).toBeNull()
    })
})

describe('quedas e sessões ilegíveis', () => {
    it('formata a queda com a seta', () => {
        const drop: DoneSet = { metric: 'repeticoes', loadKg: 30, reps: 8, durationSeconds: null, distanceM: null }

        expect(formatDropText(drop, 'total', false)).toBe('↳ 30 kg × 8 reps')
    })

    it('conta as sessões que não puderam ser lidas', () => {
        expect(formatUnreadableSessions(0)).toBeNull()
        expect(formatUnreadableSessions(1)).toBe('1 sessão não pôde ser lida')
        expect(formatUnreadableSessions(3)).toBe('3 sessões não puderam ser lidas')
    })
})
