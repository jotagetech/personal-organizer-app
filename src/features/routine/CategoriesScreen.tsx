import { ArrowLeft, Plus } from 'lucide-react'
import { useEffect, useId, useState } from 'react'

import {
    createRoutineCategory,
    deleteRoutineCategory,
    listActiveCategoryAssignments,
    RoutineCategoryNameTakenError,
    updateRoutineCategory,
} from '@/features/routine/api'
import {
    CATEGORY_COLOR_KEYS,
    CATEGORY_COLORS,
    countCategoryUsage,
    isCategoryColorKey,
    MAX_CATEGORY_NAME_LENGTH,
    validateCategoryName,
    type CategoryColorKey,
    type CategoryUsage,
} from '@/features/routine/categories'
import { CategoryDot } from '@/features/routine/CategoryDot'
import type { RoutineCategoryRow } from '@/features/routine/types'

const BUTTON_ICON_SIZE = 18
const NAME_TAKEN_MESSAGE = 'Já existe uma categoria com esse nome.'
const SAVE_FAILED_MESSAGE = 'Não foi possível salvar. Confira a conexão e tente de novo.'

type CategoriesScreenProps = {
    categories: RoutineCategoryRow[]
    onClose: () => void
    onChanged: () => Promise<void>
}

type FormTarget = { kind: 'new' } | { kind: 'edit'; category: RoutineCategoryRow }

function usageLabel(count: number): string {
    return count === 1 ? '1 item ativo' : `${count} itens ativos`
}

export function CategoriesScreen({ categories, onClose, onChanged }: CategoriesScreenProps) {
    const [formTarget, setFormTarget] = useState<FormTarget | null>(null)
    const [usage, setUsage] = useState<CategoryUsage>(new Map())
    const [loadError, setLoadError] = useState<string | null>(null)

    async function reloadUsage() {
        try {
            setUsage(countCategoryUsage(await listActiveCategoryAssignments()))
            setLoadError(null)
        } catch {
            setLoadError('Não foi possível contar o uso de cada categoria.')
        }
    }

    useEffect(() => {
        void reloadUsage()
    }, [categories])

    async function handleSaved() {
        await onChanged()
        setFormTarget(null)
    }

    return (
        <div>
            <div className="page-header">
                <h2 className="page-title">Categorias</h2>
                <button type="button" className="secondary-button" onClick={formTarget ? () => setFormTarget(null) : onClose}>
                    <ArrowLeft size={BUTTON_ICON_SIZE} aria-hidden="true" />
                    Voltar
                </button>
            </div>
            <p className="category-intro">Opcional. Sem categoria, a tarefa fica em Geral. Use para filtrar o dia.</p>
            {loadError && <div className="error-list">{loadError}</div>}
            {formTarget ? (
                <div className="card">
                    <CategoryForm
                        key={formTarget.kind === 'edit' ? formTarget.category.id : 'new'}
                        target={formTarget}
                        categories={categories}
                        onSaved={handleSaved}
                        onCancel={() => setFormTarget(null)}
                    />
                </div>
            ) : (
                <>
                    {categories.length > 0 && (
                        <div className="card category-list">
                            {categories.map((category) => (
                                <button
                                    key={category.id}
                                    type="button"
                                    className="category-list__row"
                                    onClick={() => setFormTarget({ kind: 'edit', category })}
                                >
                                    <CategoryDot color={category.color} />
                                    <span className="category-list__name">{category.name}</span>
                                    <span className="category-list__usage">{usageLabel(usage.get(category.id) ?? 0)}</span>
                                </button>
                            ))}
                        </div>
                    )}
                    <button type="button" className="secondary-button full-width" onClick={() => setFormTarget({ kind: 'new' })}>
                        <Plus size={BUTTON_ICON_SIZE} aria-hidden="true" />
                        Nova categoria
                    </button>
                </>
            )}
        </div>
    )
}

type CategoryFormProps = {
    target: FormTarget
    categories: RoutineCategoryRow[]
    onSaved: () => Promise<void>
    onCancel: () => void
}

function CategoryForm({ target, categories, onSaved, onCancel }: CategoryFormProps) {
    const fieldId = useId()
    const editing = target.kind === 'edit' ? target.category : null
    const [name, setName] = useState(editing?.name ?? '')
    const [color, setColor] = useState<CategoryColorKey>(
        editing && isCategoryColorKey(editing.color) ? editing.color : CATEGORY_COLOR_KEYS[0],
    )
    const [nameError, setNameError] = useState<string | null>(null)
    const [submitError, setSubmitError] = useState<string | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault()
        const error = validateCategoryName(name, categories, editing?.id ?? null)
        if (error) {
            setNameError(error)
            return
        }

        setNameError(null)
        setSubmitError(null)
        setIsSubmitting(true)
        try {
            await save(name.trim())
            await onSaved()
        } catch (saveError) {
            if (saveError instanceof RoutineCategoryNameTakenError) {
                setNameError(NAME_TAKEN_MESSAGE)
            } else {
                setSubmitError(SAVE_FAILED_MESSAGE)
            }
            setIsSubmitting(false)
        }
    }

    async function save(trimmedName: string) {
        if (editing) {
            await updateRoutineCategory(editing.id, trimmedName, color)
            return
        }
        await createRoutineCategory(trimmedName, color, categories.length)
    }

    async function handleDelete() {
        if (!editing) {
            return
        }
        setSubmitError(null)
        setIsSubmitting(true)
        try {
            await deleteRoutineCategory(editing.id)
            await onSaved()
        } catch {
            setSubmitError('Não foi possível apagar. Confira a conexão e tente de novo.')
            setIsSubmitting(false)
            setIsConfirmingDelete(false)
        }
    }

    return (
        <form className="new-task-form" onSubmit={handleSubmit} noValidate>
            <div className="field">
                <label htmlFor={`${fieldId}-name`}>Nome da categoria</label>
                <input
                    id={`${fieldId}-name`}
                    type="text"
                    value={name}
                    maxLength={MAX_CATEGORY_NAME_LENGTH}
                    autoComplete="off"
                    aria-invalid={nameError !== null}
                    onChange={(event) => {
                        setName(event.target.value)
                        setNameError(null)
                    }}
                />
                {nameError && <p className="new-task-form__error">{nameError}</p>}
            </div>
            <div className="new-task-form__group">
                <span className="new-task-form__label">Cor</span>
                <div className="category-color-grid">
                    {CATEGORY_COLOR_KEYS.map((colorKey) => (
                        <button
                            key={colorKey}
                            type="button"
                            className={
                                color === colorKey
                                    ? 'category-color-button category-color-button--selected'
                                    : 'category-color-button'
                            }
                            aria-label={CATEGORY_COLORS[colorKey].label}
                            aria-pressed={color === colorKey}
                            onClick={() => setColor(colorKey)}
                        >
                            <CategoryDot color={colorKey} />
                        </button>
                    ))}
                </div>
            </div>
            {submitError && <div className="error-list">{submitError}</div>}
            <div className="new-task-form__actions">
                <button type="button" className="secondary-button" disabled={isSubmitting} onClick={onCancel}>
                    Cancelar
                </button>
                <button type="submit" className="primary-button new-task-form__save" disabled={isSubmitting}>
                    {isSubmitting ? 'Salvando...' : 'Salvar'}
                </button>
            </div>
            {editing && !isConfirmingDelete && (
                <button
                    type="button"
                    className="ghost-button builder-danger"
                    disabled={isSubmitting}
                    onClick={() => setIsConfirmingDelete(true)}
                >
                    Apagar categoria
                </button>
            )}
            {editing && isConfirmingDelete && (
                <div className="builder-confirm">
                    <span>Apagar a categoria {editing.name}? Os itens e tarefas dela vão para Geral.</span>
                    <div className="form-actions">
                        <button
                            type="button"
                            className="secondary-button"
                            disabled={isSubmitting}
                            onClick={() => setIsConfirmingDelete(false)}
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            className="primary-button builder-danger-button"
                            disabled={isSubmitting}
                            onClick={handleDelete}
                        >
                            Apagar
                        </button>
                    </div>
                </div>
            )}
        </form>
    )
}
