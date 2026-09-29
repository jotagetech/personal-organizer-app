import { describe, expect, it } from 'vitest'

import {
    decideRestPushAction,
    planRestPush,
    REST_PUSH_TITLE,
    restEndsAtMs,
    restPushBody,
    type RestPushPlan,
} from '@/features/workout/restPush'
import { extendRestTimer, REST_EXTENSION_SECONDS, startRestTimer } from '@/features/workout/workoutTimers'

const START = 1_800_000_000_000
const SESSION_DATE = '2026-09-29'

function planAt(fireAtMs: number, body = 'Hora da próxima série'): RestPushPlan {
    return { fireAtMs, title: REST_PUSH_TITLE, body }
}

describe('restEndsAtMs', () => {
    it('termina no início mais o máximo da faixa', () => {
        const timer = startRestTimer(SESSION_DATE, 60, 90, START)

        expect(restEndsAtMs(timer)).toBe(START + 90_000)
    })

    it('soma o tempo extra de cada "+15 s"', () => {
        const timer = extendRestTimer(
            extendRestTimer(startRestTimer(SESSION_DATE, 60, 90, START), REST_EXTENSION_SECONDS),
            REST_EXTENSION_SECONDS,
        )

        expect(restEndsAtMs(timer)).toBe(START + 120_000)
    })
})

describe('restPushBody', () => {
    it('cita o próximo exercício quando há nome', () => {
        expect(restPushBody('  Supino reto ')).toBe('Próxima série: Supino reto')
    })

    it('usa um texto genérico sem nome', () => {
        expect(restPushBody(null)).toBe('Hora da próxima série')
        expect(restPushBody('   ')).toBe('Hora da próxima série')
    })
})

describe('planRestPush', () => {
    it('agenda para o fim do descanso, com título e corpo em pt-BR', () => {
        const timer = startRestTimer(SESSION_DATE, 60, 90, START)

        expect(planRestPush(timer, false, 'Remada')).toEqual({
            fireAtMs: START + 90_000,
            title: 'Descanso concluído',
            body: 'Próxima série: Remada',
        })
    })

    it('não há push sem descanso ou com o treino pausado', () => {
        const timer = startRestTimer(SESSION_DATE, 60, 90, START)

        expect(planRestPush(null, false, 'Remada')).toBeNull()
        expect(planRestPush(timer, true, 'Remada')).toBeNull()
    })
})

describe('decideRestPushAction', () => {
    const now = START + 1000

    it('agenda um descanso novo', () => {
        const next = planAt(START + 90_000)

        expect(decideRestPushAction(null, next, now)).toEqual({ kind: 'schedule', plan: next })
    })

    it('reagenda o descanso ainda em curso ao abrir a tela', () => {
        const next = planAt(START + 90_000)

        expect(decideRestPushAction(undefined, next, now)).toEqual({ kind: 'schedule', plan: next })
    })

    it('remarca quando o "+15 s" muda o horário', () => {
        const next = planAt(START + 105_000)

        expect(decideRestPushAction(planAt(START + 90_000), next, now)).toEqual({ kind: 'schedule', plan: next })
    })

    it('não remarca quando só o exercício exibido mudou', () => {
        const previous = planAt(START + 90_000, 'Próxima série: Remada')
        const next = planAt(START + 90_000, 'Próxima série: Supino')

        expect(decideRestPushAction(previous, next, now)).toEqual({ kind: 'none' })
    })

    it('cancela ao pular, fechar, finalizar, pausar ou trocar de treino', () => {
        expect(decideRestPushAction(planAt(START + 90_000), null, now)).toEqual({ kind: 'cancel' })
    })

    it('não cancela nada ao abrir a tela sem descanso', () => {
        expect(decideRestPushAction(undefined, null, now)).toEqual({ kind: 'none' })
        expect(decideRestPushAction(null, null, now)).toEqual({ kind: 'none' })
    })

    it('não agenda um descanso que já terminou', () => {
        const next = planAt(START + 90_000)

        expect(decideRestPushAction(null, next, START + 90_000)).toEqual({ kind: 'none' })
        expect(decideRestPushAction(undefined, next, START + 200_000)).toEqual({ kind: 'none' })
    })
})
