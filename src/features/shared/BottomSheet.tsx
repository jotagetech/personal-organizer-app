import { X } from 'lucide-react'
import { useEffect, useId, useRef, type FocusEvent, type ReactNode } from 'react'

import { useVisualViewportFrame } from '@/features/shared/useVisualViewportFrame'

interface BottomSheetProps {
    title: string
    onClose: () => void
    children: ReactNode
}

const CLOSE_ICON_SIZE = 22
// Tempo da animação do teclado do iPhone; antes disso a área visível ainda
// não encolheu e a rolagem cairia no lugar errado.
const KEYBOARD_SETTLE_MS = 320
const FOCUSABLE_SELECTOR = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href]'

// Primeiro campo de texto do conteúdo; sem ele, o primeiro controle focável.
function findInitialFocusTarget(panel: HTMLElement): HTMLElement | null {
    const body = panel.querySelector<HTMLElement>('.bottom-sheet__body')
    const firstField = body?.querySelector<HTMLElement>('input, textarea, select') ?? null
    const target = firstField ?? panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)

    return target
}

// Folha que sobe de baixo sobre um fundo escurecido. Quem a usa monta o
// componente só enquanto ela deve estar aberta: o foco inicial e a devolução
// do foco acompanham a montagem e a desmontagem.
export function BottomSheet({ title, onClose, children }: BottomSheetProps) {
    const panelRef = useRef<HTMLDivElement>(null)
    const onCloseRef = useRef(onClose)
    const titleId = useId()
    const frameStyle = useVisualViewportFrame()

    useEffect(() => {
        onCloseRef.current = onClose
    }, [onClose])

    useEffect(() => {
        const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
        const panel = panelRef.current
        if (panel) {
            findInitialFocusTarget(panel)?.focus()
        }

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                onCloseRef.current()
                return
            }
            if (event.key === 'Tab' && panel) {
                keepFocusInside(event, panel)
            }
        }
        document.addEventListener('keydown', handleKeyDown)

        return () => {
            document.removeEventListener('keydown', handleKeyDown)
            previouslyFocused?.focus()
        }
    }, [])

    return (
        <div className="bottom-sheet" role="presentation" style={frameStyle}>
            <div className="bottom-sheet__backdrop" onClick={onClose} aria-hidden="true" />
            <div
                ref={panelRef}
                className="bottom-sheet__panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
            >
                <span className="bottom-sheet__handle" aria-hidden="true" />
                <div className="bottom-sheet__header">
                    <h2 id={titleId} className="bottom-sheet__title">
                        {title}
                    </h2>
                    <button type="button" className="icon-button" aria-label="Fechar" onClick={onClose}>
                        <X size={CLOSE_ICON_SIZE} aria-hidden="true" />
                    </button>
                </div>
                <div className="bottom-sheet__body" onFocus={keepFocusedFieldVisible}>
                    {children}
                </div>
            </div>
        </div>
    )
}

// Tab e Shift+Tab circulam dentro da folha em vez de escapar para a página
// por trás do fundo escurecido.
function keepFocusInside(event: KeyboardEvent, panel: HTMLElement) {
    const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    if (focusable.length === 0) {
        return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const isLeavingStart = event.shiftKey && document.activeElement === first
    const isLeavingEnd = !event.shiftKey && document.activeElement === last

    if (isLeavingStart) {
        event.preventDefault()
        last.focus()
    } else if (isLeavingEnd) {
        event.preventDefault()
        first.focus()
    }
}

// O campo em foco continua à vista depois que o teclado termina de abrir e a
// folha encolhe para caber acima dele.
function keepFocusedFieldVisible(event: FocusEvent<HTMLDivElement>) {
    const field = event.target
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) {
        return
    }
    window.setTimeout(() => {
        field.scrollIntoView({ block: 'nearest' })
    }, KEYBOARD_SETTLE_MS)
}
