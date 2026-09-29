import { describe, expect, it } from 'vitest'

import {
    endWorkPhase,
    finishIntervalTimer,
    intervalBeepBetween,
    intervalTimerView,
    parseIntervalTimer,
    pauseIntervalTimer,
    resumeIntervalTimer,
    skipRound,
    startIntervalTimer,
    startNextRoundNow,
    syncIntervalTimer,
    type IntervalTimerConfig,
} from '@/features/workout/intervalTimer'

const START = 1_800_000_000_000
const SECOND = 1000

const SPRINTS: IntervalTimerConfig = {
    rounds: 3,
    workMinSeconds: 30,
    workMaxSeconds: 30,
    recoveryMinSeconds: 90,
    recoveryMaxSeconds: 90,
}

const ENDURANCE: IntervalTimerConfig = {
    rounds: 2,
    workMinSeconds: 180,
    workMaxSeconds: 240,
    recoveryMinSeconds: 120,
    recoveryMaxSeconds: 120,
}

function start(config: IntervalTimerConfig) {
    return startIntervalTimer('2026-09-29', 'tiros', config, START)
}

describe('syncIntervalTimer', () => {
    it('alterna trabalho e recuperação sozinho no fim de cada fase', () => {
        const timer = start(SPRINTS)

        expect(syncIntervalTimer(timer, START + 29 * SECOND)).toBe(timer)

        const inRecovery = syncIntervalTimer(timer, START + 30 * SECOND)
        expect(inRecovery).toMatchObject({ phase: 'recuperacao', roundIndex: 0 })
        expect(inRecovery.results).toEqual([{ status: 'feita', workSeconds: 30, endedAtMs: START + 30 * SECOND }])

        const secondRound = syncIntervalTimer(inRecovery, START + 120 * SECOND)
        expect(secondRound).toMatchObject({ phase: 'trabalho', roundIndex: 1, phaseStartedAtMs: START + 120 * SECOND })
    })

    it('aplica de uma vez as fases vencidas enquanto o app estava suspenso', () => {
        const timer = syncIntervalTimer(start(SPRINTS), START + 10 * 60 * SECOND)

        expect(timer.phase).toBe('concluido')
        expect(timer.results.map((result) => result.endedAtMs)).toEqual([
            START + 30 * SECOND,
            START + 150 * SECOND,
            START + 270 * SECOND,
        ])
    })

    it('não tem recuperação depois da última rodada', () => {
        const oneRound = start({ ...SPRINTS, rounds: 1 })

        expect(syncIntervalTimer(oneRound, START + 30 * SECOND).phase).toBe('concluido')
    })

    it('emenda a próxima rodada quando a recuperação é zero', () => {
        const noRecovery = start({ ...SPRINTS, recoveryMinSeconds: 0, recoveryMaxSeconds: 0 })

        expect(syncIntervalTimer(noRecovery, START + 30 * SECOND)).toMatchObject({ phase: 'trabalho', roundIndex: 1 })
    })

    it('com faixa de trabalho, só troca sozinho no máximo', () => {
        const timer = start(ENDURANCE)

        expect(syncIntervalTimer(timer, START + 200 * SECOND).phase).toBe('trabalho')
        expect(syncIntervalTimer(timer, START + 240 * SECOND).results[0]).toMatchObject({ workSeconds: 240 })
    })
})

describe('ações do timer', () => {
    it('encerrar o trabalho dentro da faixa grava o tempo feito', () => {
        const timer = endWorkPhase(start(ENDURANCE), START + 205_400)

        expect(timer.phase).toBe('recuperacao')
        expect(timer.results[0]).toEqual({ status: 'feita', workSeconds: 205, endedAtMs: START + 205_400 })
        expect(timer.phaseStartedAtMs).toBe(START + 205_400)
    })

    it('pular rodada registra pulada e segue para a recuperação', () => {
        const timer = skipRound(start(SPRINTS), START + 5 * SECOND)

        expect(timer).toMatchObject({ phase: 'recuperacao', roundIndex: 0 })
        expect(timer.results[0]).toMatchObject({ status: 'pulada', workSeconds: null })
    })

    it('começar a rodada antes do fim da recuperação', () => {
        const inRecovery = syncIntervalTimer(start(SPRINTS), START + 30 * SECOND)
        const timer = startNextRoundNow(inRecovery, START + 60 * SECOND)

        expect(timer).toMatchObject({ phase: 'trabalho', roundIndex: 1, phaseStartedAtMs: START + 60 * SECOND })
    })

    it('pausar congela a contagem e retomar devolve o que faltava', () => {
        const paused = pauseIntervalTimer(start(SPRINTS), START + 10 * SECOND)

        expect(syncIntervalTimer(paused, START + 10 * 60 * SECOND)).toBe(paused)
        expect(intervalTimerView(paused, START + 10 * 60 * SECOND)).toMatchObject({ remainingSeconds: 20, isPaused: true })

        const resumed = resumeIntervalTimer(paused, START + 100 * SECOND)
        expect(intervalTimerView(resumed, START + 100 * SECOND).remainingSeconds).toBe(20)
        expect(syncIntervalTimer(resumed, START + 120 * SECOND).phase).toBe('recuperacao')
    })

    it('encerrar antes conta a rodada em curso e pula as que faltam', () => {
        const timer = finishIntervalTimer(start(SPRINTS), START + 12 * SECOND)

        expect(timer.phase).toBe('concluido')
        expect(timer.results.map((result) => [result.status, result.workSeconds])).toEqual([
            ['feita', 12],
            ['pulada', null],
            ['pulada', null],
        ])
    })

    it('encerrar logo no começo do trabalho não conta a rodada como feita', () => {
        const timer = finishIntervalTimer(start(SPRINTS), START + 400)

        expect(timer.results[0].status).toBe('pulada')
    })
})

describe('intervalTimerView', () => {
    it('conta até o mínimo e depois até o máximo numa faixa de trabalho', () => {
        const timer = start(ENDURANCE)

        expect(intervalTimerView(timer, START + 60 * SECOND)).toMatchObject({
            phase: 'trabalho',
            roundNumber: 1,
            totalRounds: 2,
            workStage: 'antes_do_minimo',
            remainingSeconds: 120,
            hasWorkRange: true,
        })
        expect(intervalTimerView(timer, START + 190 * SECOND)).toMatchObject({ workStage: 'na_faixa', remainingSeconds: 50 })
    })

    it('mostra a próxima rodada durante a recuperação', () => {
        const inRecovery = syncIntervalTimer(start(SPRINTS), START + 30 * SECOND)

        expect(intervalTimerView(inRecovery, START + 40 * SECOND)).toMatchObject({
            phase: 'recuperacao',
            roundNumber: 2,
            remainingSeconds: 80,
            doneRounds: 1,
        })
    })
})

describe('intervalBeepBetween', () => {
    const timer = start(ENDURANCE)
    const beforeMin = intervalTimerView(timer, START + 179 * SECOND)
    const atMin = intervalTimerView(timer, START + 180 * SECOND)
    const recovery = syncIntervalTimer(timer, START + 240 * SECOND)

    it('avisa no mínimo da faixa e na troca de fase', () => {
        expect(intervalBeepBetween(beforeMin, atMin)).toBe('faixa')
        expect(intervalBeepBetween(atMin, intervalTimerView(recovery, START + 240 * SECOND))).toBe('recuperacao')
        const nextWork = syncIntervalTimer(recovery, START + 360 * SECOND)
        const lastRecoverySecond = intervalTimerView(recovery, START + 359 * SECOND)
        expect(intervalBeepBetween(lastRecoverySecond, intervalTimerView(nextWork, START + 360 * SECOND))).toBe('trabalho')
    })

    it('marca os três últimos segundos da recuperação', () => {
        const fourLeft = intervalTimerView(recovery, START + 356 * SECOND)
        const threeLeft = intervalTimerView(recovery, START + 357 * SECOND)

        expect(intervalBeepBetween(fourLeft, threeLeft)).toBe('contagem')
        expect(intervalBeepBetween(threeLeft, threeLeft)).toBeNull()
    })

    it('fica quieto em pausa e sem mudança', () => {
        const paused = intervalTimerView(pauseIntervalTimer(timer, START + 10 * SECOND), START + 10 * SECOND)

        expect(intervalBeepBetween(beforeMin, paused)).toBeNull()
        expect(intervalBeepBetween(beforeMin, beforeMin)).toBeNull()
    })
})

describe('parseIntervalTimer', () => {
    it('lê de volta um timer gravado', () => {
        const timer = syncIntervalTimer(start(SPRINTS), START + 30 * SECOND)

        expect(parseIntervalTimer(JSON.stringify(timer), START + 40 * SECOND)).toEqual(timer)
    })

    it('descarta registro velho, corrompido ou fora do formato', () => {
        const timer = start(SPRINTS)

        expect(parseIntervalTimer(JSON.stringify(timer), START + 4 * 60 * 60 * SECOND)).toBeNull()
        expect(parseIntervalTimer('{', START)).toBeNull()
        expect(parseIntervalTimer(JSON.stringify({ ...timer, phase: 'aquecimento' }), START)).toBeNull()
        expect(parseIntervalTimer(JSON.stringify({ ...timer, roundIndex: 3 }), START)).toBeNull()
        expect(parseIntervalTimer(JSON.stringify({ ...timer, results: [{ status: 'feita' }] }), START)).toBeNull()
    })
})
