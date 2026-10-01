import { BookmarkPlus, Link2Off, Plus } from 'lucide-react'
import { useState } from 'react'

import { CatalogSuggestions, exerciseMeta } from '@/features/exerciseCatalog/CatalogSuggestions'
import { addOwnAlias, createPrivateExercise } from '@/features/exerciseCatalog/api'
import { findExerciseBySlug, isKnownNameFor, searchCatalog } from '@/features/exerciseCatalog/catalogSearch'
import type { ExerciseRow } from '@/features/exerciseCatalog/types'
import { useExerciseCatalog } from '@/features/exerciseCatalog/useExerciseCatalog'
import { applyCatalogExercise, unlinkCatalogExercise } from '@/features/workout/builder/builderCatalog'
import type { BuilderExercise, EquipmentChoice } from '@/features/workout/builder/builderTypes'
import { normalizeAlias } from '@/lib/exerciseCatalogSeed'
import type { EquipmentType } from '@/lib/workoutPlanSchema'

const ICON_SIZE = 16
const MIN_NAME_TO_CREATE = 3

type CatalogNameAssistProps = {
    exercise: BuilderExercise
    isNameFocused: boolean
    onChange: (exercise: BuilderExercise) => void
}

type PendingAlias = {
    text: string
    exerciseId: string
    exerciseName: string
}

// "maquina_assistida" existe só na tela; no catálogo é máquina com a forma
// de carga de assistência.
function equipmentForCatalog(choice: EquipmentChoice | ''): EquipmentType | null {
    const equipment = choice === '' ? null : choice === 'maquina_assistida' ? 'maquina' : choice

    return equipment
}

function errorText(error: unknown, fallback: string): string {
    const message = error instanceof Error ? error.message : fallback

    return message
}

// Liga o nome digitado no montador ao catálogo: sugere exercícios enquanto a
// pessoa digita, mostra a qual exercício o nome ficou ligado e oferece guardar
// o que ela digitou ("sprh") como apelido da conta. Sem catálogo (rede ruim),
// o campo continua funcionando como texto livre.
export function CatalogNameAssist({ exercise, isNameFocused, onChange }: CatalogNameAssistProps) {
    const { index, errorMessage, reload } = useExerciseCatalog()
    const [pendingAlias, setPendingAlias] = useState<PendingAlias | null>(null)
    const [notice, setNotice] = useState<string | null>(null)
    const [isSaving, setIsSaving] = useState(false)

    if (exercise.tipo !== 'series') {
        return null
    }
    if (!index) {
        return errorMessage ? <p className="builder-hint">Catálogo indisponível; o nome fica como digitado.</p> : null
    }

    const typedName = exercise.nome.trim()
    const linkedExercise = exercise.catalogo ? findExerciseBySlug(index, exercise.catalogo) : null
    const isTypedNameLinked = linkedExercise !== null && normalizeAlias(linkedExercise.name_pt) === normalizeAlias(typedName)
    const showSuggestions = isNameFocused && !isTypedNameLinked
    const result = showSuggestions ? searchCatalog(index, typedName) : null
    const hasNoMatch = result !== null && result.matches.length === 0 && result.generic === null
    const canCreate = hasNoMatch && normalizeAlias(typedName).length >= MIN_NAME_TO_CREATE

    function pick(row: ExerciseRow) {
        const needsAlias = !isKnownNameFor(index!, typedName, row.id)
        setPendingAlias(needsAlias ? { text: typedName, exerciseId: row.id, exerciseName: row.name_pt } : null)
        setNotice(null)
        onChange(applyCatalogExercise(exercise, row))
    }

    async function saveAlias(alias: PendingAlias) {
        setIsSaving(true)
        try {
            await addOwnAlias(alias.exerciseId, alias.text)
            await reload()
            setNotice(`Apelido guardado: "${alias.text}" leva a ${alias.exerciseName}.`)
            setPendingAlias(null)
        } catch (saveError) {
            setNotice(errorText(saveError, 'Não deu para guardar o apelido'))
        } finally {
            setIsSaving(false)
        }
    }

    async function createOwnExercise() {
        setIsSaving(true)
        try {
            const created = await createPrivateExercise({
                name: typedName,
                equipment: equipmentForCatalog(exercise.equipamento),
                pegada: exercise.pegada || null,
                largura_pegada: exercise.largura_pegada || null,
                acessorio: exercise.acessorio || null,
                defaultLoadForm: exercise.forma_carga,
            })
            await reload()
            setNotice(`Criado só para você: ${created.name_pt}.`)
            onChange({ ...exercise, catalogo: created.slug })
        } catch (createError) {
            setNotice(errorText(createError, 'Não deu para criar o exercício'))
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="catalog-assist">
            {result && <CatalogSuggestions result={result} onPick={pick} />}
            {canCreate && (
                <button
                    type="button"
                    className="ghost-button catalog-assist__action"
                    disabled={isSaving}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => void createOwnExercise()}
                >
                    <Plus size={ICON_SIZE} aria-hidden="true" />
                    Não achou? Criar "{typedName}" só para você
                </button>
            )}
            {exercise.catalogo && (
                <div className="catalog-assist__linked">
                    <span className="catalog-assist__linked-text">
                        No catálogo: <strong>{linkedExercise?.name_pt ?? exercise.catalogo}</strong>
                        {linkedExercise && exerciseMeta(linkedExercise) && (
                            <span className="catalog-suggestions__meta"> · {exerciseMeta(linkedExercise)}</span>
                        )}
                    </span>
                    <button
                        type="button"
                        className="ghost-button catalog-assist__action"
                        onClick={() => onChange(unlinkCatalogExercise(exercise))}
                    >
                        <Link2Off size={ICON_SIZE} aria-hidden="true" />
                        Desvincular
                    </button>
                </div>
            )}
            {pendingAlias && (
                <button
                    type="button"
                    className="ghost-button catalog-assist__action"
                    disabled={isSaving}
                    onClick={() => void saveAlias(pendingAlias)}
                >
                    <BookmarkPlus size={ICON_SIZE} aria-hidden="true" />
                    Guardar "{pendingAlias.text}" como seu apelido
                </button>
            )}
            {notice && <p className="builder-hint">{notice}</p>}
        </div>
    )
}
