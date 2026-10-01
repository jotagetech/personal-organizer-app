import { ArrowLeft, Plus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { CatalogSuggestions } from '@/features/exerciseCatalog/CatalogSuggestions'
import { createPrivateExercise, linkHistoryName, listUnlinkedExerciseNames } from '@/features/exerciseCatalog/api'
import { searchCatalog, type CatalogIndex } from '@/features/exerciseCatalog/catalogSearch'
import type { ExerciseRow, UnlinkedExerciseNameRow } from '@/features/exerciseCatalog/types'
import { useExerciseCatalog } from '@/features/exerciseCatalog/useExerciseCatalog'
import { formatDateLabel } from '@/features/shared/DateHeader'

const BUTTON_ICON_SIZE = 18

type UnlinkedExercisesPanelProps = {
    onClose: () => void
}

type UnlinkedRowProps = {
    row: UnlinkedExerciseNameRow
    index: CatalogIndex
    onLinked: () => Promise<void>
}

function errorText(error: unknown, fallback: string): string {
    const message = error instanceof Error ? error.message : fallback

    return message
}

// Um nome do histórico: a busca começa com o próprio nome, a pessoa ajusta se
// precisar e escolhe o exercício. A ligação vale só para a conta e alcança
// todas as séries antigas e futuras com esse nome.
function UnlinkedRow({ row, index, onLinked }: UnlinkedRowProps) {
    const [query, setQuery] = useState(row.example_name)
    const [isSaving, setIsSaving] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const result = searchCatalog(index, query)
    const fieldId = `unlinked-${row.match_key.replaceAll(' ', '-')}`

    async function run(action: () => Promise<unknown>, fallback: string) {
        setIsSaving(true)
        setErrorMessage(null)
        try {
            await action()
            await onLinked()
        } catch (actionError) {
            setErrorMessage(errorText(actionError, fallback))
            setIsSaving(false)
        }
    }

    function link(exercise: ExerciseRow) {
        void run(() => linkHistoryName(row.example_name, exercise.id), 'Não deu para ligar o nome')
    }

    function createOwn() {
        const name = query.trim()
        void run(
            () =>
                createPrivateExercise({
                    name,
                    equipment: null,
                    pegada: null,
                    largura_pegada: null,
                    acessorio: null,
                    defaultLoadForm: 'total',
                }).then((created) => linkHistoryName(row.example_name, created.id)),
            'Não deu para criar o exercício',
        )
    }

    return (
        <div className="catalog-link-row">
            <span className="catalog-link-row__title">{row.example_name}</span>
            <span className="text-small text-muted">
                {row.set_count} {row.set_count === 1 ? 'série' : 'séries'} · último treino em{' '}
                {formatDateLabel(row.last_session_date)}
            </span>
            <div className="field">
                <label htmlFor={fieldId}>É qual exercício?</label>
                <input
                    id={fieldId}
                    type="text"
                    autoComplete="off"
                    value={query}
                    disabled={isSaving}
                    onChange={(event) => setQuery(event.target.value)}
                />
            </div>
            {!isSaving && <CatalogSuggestions result={result} onPick={link} />}
            <button
                type="button"
                className="ghost-button catalog-assist__action"
                disabled={isSaving || query.trim().length === 0}
                onClick={createOwn}
            >
                <Plus size={BUTTON_ICON_SIZE} aria-hidden="true" />
                Criar "{query.trim()}" só para você
            </button>
            {errorMessage && <p className="error-list">{errorMessage}</p>}
        </div>
    )
}

export function UnlinkedExercisesPanel({ onClose }: UnlinkedExercisesPanelProps) {
    const { index, errorMessage: catalogError, reload: reloadCatalog } = useExerciseCatalog()
    const [rows, setRows] = useState<UnlinkedExerciseNameRow[] | null>(null)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    const loadRows = useCallback(async () => {
        try {
            const loadedRows = await listUnlinkedExerciseNames()
            setRows(loadedRows)
            setErrorMessage(null)
        } catch (loadError) {
            setErrorMessage(errorText(loadError, 'Falha ao carregar os nomes'))
        }
    }, [])

    useEffect(() => {
        void loadRows()
    }, [loadRows])

    async function handleLinked() {
        await Promise.all([loadRows(), reloadCatalog()])
    }

    const loadError = errorMessage ?? catalogError
    const isLoading = rows === null || index === null

    return (
        <div>
            <div className="page-header">
                <h2 className="page-title">Exercícios do histórico</h2>
                <button type="button" className="secondary-button" onClick={onClose}>
                    <ArrowLeft size={BUTTON_ICON_SIZE} aria-hidden="true" />
                    Voltar
                </button>
            </div>
            <p className="text-small text-muted">
                Nomes dos seus treinos que ainda não estão ligados a um exercício do catálogo, como nomes que
                servem para mais de uma variação ("pull down", "remada baixa"). Ligar junta o histórico desse nome
                com o do exercício, só na sua conta.
            </p>
            {loadError && <p className="error-list">{loadError}</p>}
            {!loadError && isLoading && <p className="text-small text-muted">Carregando...</p>}
            {!isLoading && rows.length === 0 && (
                <p className="text-small text-muted">Todos os exercícios do seu histórico estão ligados ao catálogo.</p>
            )}
            {!isLoading && rows.length > 0 && (
                <div className="catalog-link-list">
                    {rows.map((row) => (
                        <UnlinkedRow key={row.match_key} row={row} index={index} onLinked={handleLinked} />
                    ))}
                </div>
            )}
        </div>
    )
}
