import { describe, expect, it } from 'vitest'

import {
    elapsedSeconds,
    extendRestTimer,
    formatClock,
    parseRestTimer,
    parseStopwatchRecord,
    restPhase,
    restRemainingSeconds,
    startRestTimer,
    stopwatchPhase,
} from '@/features/workout/workoutTimers'

const START = 1_800_000_000_000

describe('elapsedSeconds', () => {
    it('conta a partir do timestamp, mesmo depois de uma suspensão longa', () => {
        expect(elapsedSeconds(START, START + 90_500)).toBe(90)
    })

    it('nunca fica negativo se o relógio voltar', () => {
        expect(elapsedSeconds(START, START - 5000)).toBe(0)
    })
})

describe('stopwatchPhase', () => {
    it('passa por antes do mínimo, faixa e depois do máximo', () => {
        expect(stopwatchPhase(19, 20, 40)).toBe('antes_do_minimo')
        expect(stopwatchPhase(20, 20, 40)).toBe('na_faixa')
        expect(stopwatchPhase(39, 20, 40)).toBe('na_faixa')
        expect(stopwatchPhase(40, 20, 40)).toBe('passou_do_maximo')
    })

    it('com mínimo igual ao máximo vai direto da espera para o máximo', () => {
        expect(stopwatchPhase(29, 30, 30)).toBe('antes_do_minimo')
        expect(stopwatchPhase(30, 30, 30)).toBe('passou_do_maximo')
    })
})

describe('descanso', () => {
    const timer = startRestTimer('2026-09-29', 90, 120, START)

    it('conta regressivamente até o máximo', () => {
        expect(restRemainingSeconds(timer, START)).toBe(120)
        expect(restRemainingSeconds(timer, START + 30_000)).toBe(90)
        expect(restRemainingSeconds(timer, START + 119_100)).toBe(1)
        expect(restRemainingSeconds(timer, START + 500_000)).toBe(0)
    })

    it('destaca a faixa depois do mínimo e termina no máximo', () => {
        expect(restPhase(timer, START + 89_000)).toBe('aguardando_minimo')
        expect(restPhase(timer, START + 90_000)).toBe('na_faixa')
        expect(restPhase(timer, START + 120_000)).toBe('terminado')
    })

    it('mais 15 s estende o fim sem mexer no mínimo', () => {
        const extended = extendRestTimer(timer, 15)

        expect(restRemainingSeconds(extended, START + 120_000)).toBe(15)
        expect(restPhase(extended, START + 120_000)).toBe('na_faixa')
        expect(restPhase(extended, START + 135_000)).toBe('terminado')
    })
})

describe('formatClock', () => {
    it('formata minutos e segundos', () => {
        expect(formatClock(0)).toBe('0:00')
        expect(formatClock(65)).toBe('1:05')
        expect(formatClock(600)).toBe('10:00')
    })
})

describe('leitura do armazenamento', () => {
    it('devolve o registro válido do cronômetro', () => {
        const raw = JSON.stringify({ sessionDate: '2026-09-29', setKey: 'a:0', startedAtMs: START })

        expect(parseStopwatchRecord(raw, START + 5000)).toEqual({
            sessionDate: '2026-09-29',
            setKey: 'a:0',
            startedAtMs: START,
        })
    })

    it('descarta ausente, corrompido, incompleto e velho demais', () => {
        const oldRaw = JSON.stringify({ sessionDate: 'd', setKey: 'k', startedAtMs: START })

        expect(parseStopwatchRecord(null, START)).toBeNull()
        expect(parseStopwatchRecord('{oops', START)).toBeNull()
        expect(parseStopwatchRecord('{"sessionDate":"d"}', START)).toBeNull()
        expect(parseStopwatchRecord(oldRaw, START + 4 * 60 * 60 * 1000)).toBeNull()
    })

    it('ida e volta do descanso preserva o tempo extra', () => {
        const timer = extendRestTimer(startRestTimer('2026-09-29', 60, 90, START), 15)

        expect(parseRestTimer(JSON.stringify(timer), START + 1000)).toEqual(timer)
        expect(parseRestTimer('{"startedAtMs":1}', START)).toBeNull()
    })
})
