import { useUndoableActions } from '@/contexts/UndoableActionContext'

export function UndoBar() {
    const { pendingDeletions, undoDeletion } = useUndoableActions()

    if (pendingDeletions.length === 0) {
        return null
    }

    const mostRecentDeletion = pendingDeletions[pendingDeletions.length - 1]

    return (
        <div className="undo-bar">
            <span className="undo-bar__label">{mostRecentDeletion.label} excluído</span>
            <button
                type="button"
                className="undo-bar__button"
                onClick={() => undoDeletion(mostRecentDeletion.id)}
            >
                Desfazer
            </button>
        </div>
    )
}
