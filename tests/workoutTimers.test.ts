import { describe, expect, it } from 'vitest'

import {
    elapsedSeconds,
    elapsedSecondsBetween,
    extendRestTimer,
    formatClock,
    formatElapsedClock,
    parseRestTimer,
    parseStopwatchRecord,
    restPhase,
    restRemainingSeconds,
    shouldStartRest,
    startRestTimer,
    stopwatchPhase,
    timedSetClock,
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

describe('shouldStartRest', () => {
    it('começa quando há descanso prescrito e série pela frente', () => {
        expect(shouldStartRest(90, 120, true)).toBe(true)
    })

    it('não começa depois da última série do treino', () => {
        expect(shouldStartRest(90, 120, false)).toBe(false)
    })

    it('não começa sem descanso prescrito', () => {
        expect(shouldStartRest(null, null, true)).toBe(false)
        expect(shouldStartRest(90, null, true)).toBe(false)
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

describe('formatElapsedClock', () => {
    it('usa m:ss abaixo de uma hora', () => {
        expect(formatElapsedClock(0)).toBe('0:00')
        expect(formatElapsedClock(65)).toBe('1:05')
        expect(formatElapsedClock(3599)).toBe('59:59')
    })

    it('usa h:mm:ss a partir de uma hora', () => {
        expect(formatElapsedClock(3600)).toBe('1:00:00')
        expect(formatElapsedClock(3600 + 5 * 60 + 7)).toBe('1:05:07')
        expect(formatElapsedClock(10 * 3600 + 59)).toBe('10:00:59')
    })

    it('nunca mostra tempo negativo nem fração de segundo', () => {
        expect(formatElapsedClock(-10)).toBe('0:00')
        expect(formatElapsedClock(61.9)).toBe('1:01')
    })
})

describe('elapsedSecondsBetween', () => {
    it('conta os segundos desde o instante ISO', () => {
        const startIso = new Date(START).toISOString()

        expect(elapsedSecondsBetween(startIso, START + 125_400)).toBe(125)
    })

    it('trata horário ilegível como zero', () => {
        expect(elapsedSecondsBetween('ontem', START)).toBe(0)
    })
})

describe('timedSetClock', () => {
    it('começa pelo preparo de 5 s, contando de 5 até 1', () => {
        expect(timedSetClock(START, START, 30)).toMatchObject({ stage: 'preparando', prepRemainingSeconds: 5 })
        expect(timedSetClock(START, START + 4_100, 30)).toMatchObject({ stage: 'preparando', prepRemainingSeconds: 1 })
    })

    it('depois do preparo conta para baixo a partir da meta', () => {
        expect(timedSetClock(START, START + 5_000, 30)).toMatchObject({
            stage: 'contando',
            remainingSeconds: 30,
            elapsedSeconds: 0,
        })
        expect(timedSetClock(START, START + 17_400, 30)).toMatchObject({
            stage: 'contando',
            remainingSeconds: 18,
            elapsedSeconds: 12,
        })
    })

    it('termina ao chegar no zero', () => {
        expect(timedSetClock(START, START + 35_000, 30)).toMatchObject({
            stage: 'terminado',
            remainingSeconds: 0,
            elapsedSeconds: 30,
        })
    })
})
