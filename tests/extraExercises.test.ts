import { describe, expect, it } from 'vitest'

import {
    appendExtraExercise,
    appendExtraExercises,
    buildNewExtraExercise,
    collectExtraSuggestions,
    filterExtraSuggestions,
    findExactSuggestion,
    generateExtraExerciseKey,
    knownExerciseKeys,
    normalizeExerciseName,
    parseExtraExerciseForm,
    type ExtraExerciseForm,
    type ExtraSuggestionSources,
    type PastSessionSnapshot,
} from '@/features/workout/extraExercises'
import { planDefaultRest } from '@/features/workout/restPrescription'
import { buildWorkoutSnapshot } from '@/features/workout/snapshot'
import type { WorkoutSnapshot, WorkoutSnapshotExercise } from '@/features/workout/types'
import { parseWorkoutPlanJson, type WorkoutPlan } from '@/lib/workoutPlanSchema'
import { normalizeWorkoutSnapshot } from '@/lib/workoutSnapshotSchema'
import { repsSnapshotSet, SNAPSHOT_EXERCISE_DEFAULTS } from './workoutFixtures'

function parsedPlan(): WorkoutPlan {
    const result = parseWorkoutPlanJson(
        JSON.stringify({
            versao: 2,
            nome: 'Plano',
            unidade_carga: 'kg',
            bloco_semanas: 4,
            descanso_padrao_segundos_min: 60,
            descanso_padrao_segundos_max: 90,
            treinos: [
                {
                    id: 'treino-a',
                    nome: 'A',
                    exercicios: [
                        {
                            id: 'supino',
                            nome: 'Supino',
                            forma_carga: 'total',
                            series: [{ repeticoes_min: 8, repeticoes_max: 10 }],
                        },
                        {
                            id: 'rosca-direta',
                            nome: 'Rosca Direta',
                            forma_carga: 'total',
                            series: [{ repeticoes_min: 10, repeticoes_max: 12 }],
                        },
                    ],
                },
                {
                    id: 'treino-b',
                    nome: 'B',
                    exercicios: [
                        {
                            id: 'agachamento',
                            nome: 'Agachamento',
                            forma_carga: 'total',
                            descanso_segundos_min: 120,
                            descanso_segundos_max: 150,
                            series: [
                                { repeticoes_min: 5, repeticoes_max: 5 },
                                { repeticoes_min: 5, repeticoes_max: 5 },
                            ],
                            variacoes_semana: [{ semanas: [2], series: [{ repeticoes_min: 3, repeticoes_max: 3 }] }],
                        },
                        {
                            id: 'rosca-direta',
                            nome: 'Rosca direta (B)',
                            forma_carga: 'total',
                            series: [{ repeticoes_min: 15, repeticoes_max: 15 }],
                        },
                    ],
                },
            ],
        }),
    )
    if (!result.success) {
        throw new Error(JSON.stringify(result.errors))
    }

    return result.plan
}

function extraExercise(exerciseKey: string, nome: string): WorkoutSnapshotExercise {
    return {
        ...SNAPSHOT_EXERCISE_DEFAULTS,
        exercise_key: exerciseKey,
        nome,
        forma_carga: 'total',
        series: [repsSnapshotSet(1, 12, 15, null)],
        extra: true,
    }
}

function pastSession(sessionDate: string, exercicios: WorkoutSnapshotExercise[]): PastSessionSnapshot {
    return {
        sessionDate,
        snapshot: {
            versao: 2,
            workout_key: 'treino-a',
            nome: 'A',
            semana_bloco: null,
            bloco_semanas: null,
            descricao_semana: null,
            exercicios,
        },
    }
}

function sourcesFor(pastSessions: PastSessionSnapshot[] = [], todaySnapshot?: WorkoutSnapshot): ExtraSuggestionSources {
    const plan = parsedPlan()

    return {
        plan,
        planWeek: null,
        pastSessions,
        todaySnapshot: todaySnapshot ?? buildWorkoutSnapshot(plan.treinos[0], null, planDefaultRest(plan)),
    }
}

function emptyForm(overrides: Partial<ExtraExerciseForm> = {}): ExtraExerciseForm {
    return {
        nome: 'Elevação lateral',
        metrica: 'repeticoes',
        series: '3',
        alvo: { min: '12', max: '15', fixo: false },
        descanso: { min: '', max: '', fixo: true },
        ...overrides,
    }
}

describe('collectExtraSuggestions', () => {
    it('sugere os exercícios dos outros dias do plano, sem os que já estão no treino de hoje', () => {
        const suggestions = collectExtraSuggestions(sourcesFor())

        expect(suggestions.map((suggestion) => suggestion.exercise.exercise_key)).toEqual(['agachamento'])
        expect(suggestions[0].source).toEqual({ kind: 'plano', workoutName: 'B' })
    })

    it('copia a prescrição resolvida para a semana e o descanso, marcando como extra', () => {
        const sources = { ...sourcesFor(), planWeek: { semana: 2, totalSemanas: 4, volta: 1, descricao: null } }
        const [agachamento] = collectExtraSuggestions(sources)

        expect(agachamento.exercise.extra).toBe(true)
        expect(agachamento.exercise.series.map((serie) => [serie.alvo_min, serie.alvo_max])).toEqual([[3, 3]])
        expect(agachamento.exercise.descanso_segundos_min).toBe(120)
        expect(agachamento.exercise.descanso_segundos_max).toBe(150)
    })

    it('mantém uma sugestão por exercise_key quando o mesmo exercício aparece em mais de um dia', () => {
        const plan = parsedPlan()
        const todayWithOnlySupino = buildWorkoutSnapshot(
            { ...plan.treinos[0], exercicios: [plan.treinos[0].exercicios[0]] },
            null,
            planDefaultRest(plan),
        )
        const suggestions = collectExtraSuggestions(sourcesFor([], todayWithOnlySupino))

        const keys = suggestions.map((suggestion) => suggestion.exercise.exercise_key)
        expect(keys).toEqual(['rosca-direta', 'agachamento'])
        expect(suggestions[0].exercise.nome).toBe('Rosca Direta')
    })

    it('inclui extras de sessões anteriores, o mais recente vencendo, sem repetir os do plano', () => {
        const suggestions = collectExtraSuggestions(
            sourcesFor([
                pastSession('2026-09-20', [extraExercise('extra-panturrilha', 'Panturrilha antiga')]),
                pastSession('2026-09-25', [
                    extraExercise('extra-panturrilha', 'Panturrilha'),
                    { ...extraExercise('agachamento', 'Agachamento'), extra: true },
                    { ...extraExercise('stiff', 'Stiff'), extra: undefined },
                ]),
            ]),
        )

        expect(suggestions.map((suggestion) => suggestion.exercise.exercise_key)).toEqual([
            'agachamento',
            'extra-panturrilha',
        ])
        expect(suggestions[1].exercise.nome).toBe('Panturrilha')
        expect(suggestions[1].source).toEqual({ kind: 'extra', sessionDate: '2026-09-25' })
    })
})

describe('filterExtraSuggestions', () => {
    const suggestions = collectExtraSuggestions(
        sourcesFor([
            pastSession('2026-09-25', [
                extraExercise('extra-abdominal', 'Abdominal supra'),
                extraExercise('extra-remada-alta', 'Remada alta'),
                extraExercise('extra-crucifixo', 'Crucifixo inverso'),
            ]),
        ]),
    )

    it('ignora acento e caixa e põe quem começa com o texto antes de quem só contém', () => {
        const names = filterExtraSuggestions(suggestions, 'ALTA').map((suggestion) => suggestion.exercise.nome)
        expect(names).toEqual(['Remada alta'])

        const byPrefix = filterExtraSuggestions(suggestions, 'a').map((suggestion) => suggestion.exercise.nome)
        expect(byPrefix.slice(0, 2)).toEqual(['Agachamento', 'Abdominal supra'])
    })

    it('não sugere nada com o campo vazio', () => {
        expect(filterExtraSuggestions(suggestions, '   ')).toEqual([])
    })

    it('acha a correspondência exata do nome digitado', () => {
        expect(findExactSuggestion(suggestions, '  crucifixo   INVERSO ')?.exercise.exercise_key).toBe('extra-crucifixo')
        expect(findExactSuggestion(suggestions, 'crucifixo')).toBeNull()
    })
})

describe('generateExtraExerciseKey', () => {
    it('gera a chave a partir do nome, com prefixo próprio', () => {
        expect(generateExtraExerciseKey('Elevação Lateral', new Set())).toBe('extra-elevacao-lateral')
        expect(generateExtraExerciseKey('!!!', new Set())).toBe('extra-exercicio')
    })

    it('não colide com o plano, com extras anteriores nem com o treino de hoje', () => {
        const sources = sourcesFor([pastSession('2026-09-25', [extraExercise('extra-supino', 'Supino extra')])])
        const taken = knownExerciseKeys(sources)

        expect(taken.has('agachamento')).toBe(true)
        expect(taken.has('extra-supino')).toBe(true)
        expect(generateExtraExerciseKey('Supino', taken)).toBe('extra-supino-2')
        expect(generateExtraExerciseKey('Supino', new Set([...taken, 'extra-supino-2']))).toBe('extra-supino-3')
    })

    it('é a mesma para o mesmo nome e as mesmas chaves conhecidas', () => {
        const taken = new Set(['supino'])
        expect(generateExtraExerciseKey('Face pull', taken)).toBe(generateExtraExerciseKey('face  pull', taken))
    })
})

describe('parseExtraExerciseForm', () => {
    it('aceita o formulário completo e deixa o descanso vazio como ausente', () => {
        const result = parseExtraExerciseForm(emptyForm({ nome: '  Elevação   lateral ' }))

        expect(result).toEqual({
            success: true,
            value: {
                nome: 'Elevação lateral',
                metrica: 'repeticoes',
                seriesCount: 3,
                alvoMin: 12,
                alvoMax: 15,
                descanso: null,
            },
        })
    })

    it('segue as regras do contrato para alvo, séries e descanso', () => {
        expect(parseExtraExerciseForm(emptyForm({ nome: ' ' })).success).toBe(false)
        expect(parseExtraExerciseForm(emptyForm({ series: '0' })).success).toBe(false)
        expect(parseExtraExerciseForm(emptyForm({ series: '2,5' })).success).toBe(false)
        expect(parseExtraExerciseForm(emptyForm({ alvo: { min: '15', max: '12', fixo: false } })).success).toBe(false)
        expect(parseExtraExerciseForm(emptyForm({ alvo: { min: '10,5', max: '10,5', fixo: true } })).success).toBe(false)
        expect(parseExtraExerciseForm(emptyForm({ descanso: { min: '60', max: '', fixo: false } })).success).toBe(false)

        const distance = parseExtraExerciseForm(
            emptyForm({ metrica: 'distancia', alvo: { min: '400,5', max: '400,5', fixo: true } }),
        )
        expect(distance.success).toBe(true)
    })
})

describe('buildNewExtraExercise', () => {
    const parsed = {
        nome: 'Prancha',
        metrica: 'tempo' as const,
        seriesCount: 2,
        alvoMin: 30,
        alvoMax: 45,
        descanso: null,
    }

    it('monta as séries com a medida escolhida e sem descanso próprio usa o padrão do plano', () => {
        const exercise = buildNewExtraExercise('extra-prancha', parsed, { min: 60, max: 90 })

        expect(exercise.extra).toBe(true)
        expect(exercise.tipo).toBe('series')
        expect(exercise.descanso_segundos_min).toBe(60)
        expect(exercise.descanso_segundos_max).toBe(90)
        expect(exercise.series.map((serie) => [serie.set_index, serie.metrica, serie.alvo_min, serie.alvo_max])).toEqual([
            [1, 'tempo', 30, 45],
            [2, 'tempo', 30, 45],
        ])
    })

    it('com descanso próprio, ele vence o padrão do plano', () => {
        const exercise = buildNewExtraExercise('extra-prancha', { ...parsed, descanso: { min: 30, max: 30 } }, { min: 60, max: 90 })

        expect([exercise.descanso_segundos_min, exercise.descanso_segundos_max]).toEqual([30, 30])
    })

    it('passa pela validação do snapshot, que preserva a marca de extra', () => {
        const exercise = buildNewExtraExercise('extra-prancha', parsed, null)
        const snapshot = appendExtraExercise(sourcesFor().todaySnapshot, exercise)

        const normalized = normalizeWorkoutSnapshot(JSON.parse(JSON.stringify(snapshot)))
        expect(normalized.exercicios.at(-1)).toEqual(exercise)
        expect(normalized.exercicios[0].extra).toBeUndefined()
    })
})

describe('appendExtraExercise', () => {
    it('acrescenta no fim da lista e ignora uma chave que o snapshot já tem', () => {
        const today = sourcesFor().todaySnapshot
        const withExtra = appendExtraExercise(today, extraExercise('extra-a', 'A'))

        expect(withExtra.exercicios.map((exercicio) => exercicio.exercise_key)).toEqual([
            'supino',
            'rosca-direta',
            'extra-a',
        ])
        expect(appendExtraExercise(withExtra, extraExercise('extra-a', 'A de novo'))).toBe(withExtra)
        expect(appendExtraExercise(today, { ...extraExercise('supino', 'Supino'), extra: true })).toBe(today)
    })

    it('mantém a ordem de vários extras', () => {
        const today = sourcesFor().todaySnapshot
        const withExtras = appendExtraExercises(today, [extraExercise('extra-a', 'A'), extraExercise('extra-b', 'B')])

        expect(withExtras.exercicios.slice(-2).map((exercicio) => exercicio.exercise_key)).toEqual(['extra-a', 'extra-b'])
    })

    it('normaliza o nome para comparação sem mexer no texto gravado', () => {
        expect(normalizeExerciseName('  Elevação   LATERAL ')).toBe('elevacao lateral')
    })
})
