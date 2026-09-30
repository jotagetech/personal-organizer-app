import { Check } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'

import {
    GROUP_CAPTION,
    groupChipsOf,
    groupRoundText,
    type GroupChip,
    type GroupHandoff,
} from '@/features/workout/groupPresentation'
import type { SupersetContext, SupersetLabel } from '@/features/workout/supersets'

const CHIP_ICON_SIZE = 12
const CHIP_ICON_STROKE = 3

const CHIP_CLASS_BY_STATE = {
    current: 'group-chip group-chip--current',
    done: 'group-chip group-chip--done',
    pending: 'group-chip',
} as const

const CHIP_STATE_TEXT = { current: 'atual', done: 'feito na rodada', pending: 'falta' } as const

// Faixa no topo do card da série: rótulo e rodada, e os membros na ordem em
// que são feitos, terminando no descanso da rodada.
export function GroupBanner({ context }: { context: SupersetContext }) {
    const chips = groupChipsOf(context)

    return (
        <div className="group-banner">
            <div className="group-banner__bar">
                <span className="group-banner__label">
                    <span aria-hidden="true">⛓</span> {context.label}
                </span>
                <span className="group-banner__round">{groupRoundText(context)}</span>
            </div>
            <ol className="group-banner__chips" aria-label={`Ordem da rodada no ${context.label}`}>
                {chips.map((chip) => (
                    <Fragment key={chip.exerciseKey}>
                        <GroupChipItem chip={chip} />
                        <li className="group-banner__arrow" aria-hidden="true">
                            ▸
                        </li>
                    </Fragment>
                ))}
                <li className="group-chip group-chip--rest">descanso</li>
            </ol>
        </div>
    )
}

function GroupChipItem({ chip }: { chip: GroupChip }) {
    return (
        <li className={CHIP_CLASS_BY_STATE[chip.state]} aria-current={chip.state === 'current' ? 'step' : undefined}>
            {chip.state === 'done' && <Check size={CHIP_ICON_SIZE} strokeWidth={CHIP_ICON_STROKE} aria-hidden="true" />}
            {chip.nome}
            <span className="visually-hidden"> ({CHIP_STATE_TEXT[chip.state]})</span>
        </li>
    )
}

type GroupHandoffPanelProps = {
    handoff: GroupHandoff
    onDismiss: () => void
}

// Some sozinho e também ao toque. O leitor de tela é avisado por uma região
// à parte, sempre montada, e por isso o painel em si fica fora da leitura.
export function GroupHandoffPanel({ handoff, onDismiss }: GroupHandoffPanelProps) {
    const detail = handoff.suggestion ? `${handoff.target}, sugestão ${handoff.suggestion}` : handoff.target

    return (
        <button type="button" className="group-handoff" aria-hidden="true" tabIndex={-1} onClick={onDismiss}>
            <span className="group-handoff__kicker">
                <span aria-hidden="true">⛓</span> {handoff.label} · sem descanso
            </span>
            <span className="group-handoff__title">Vai pra {handoff.nome}</span>
            <span className="group-handoff__detail">{detail}</span>
            {handoff.lastTime && <span className="group-handoff__detail">{handoff.lastTime}</span>}
        </button>
    )
}

type GroupBoxProps = {
    label: SupersetLabel
    children: ReactNode
}

// Caixa que reúne os membros de um grupo nas listas (seletor de exercícios e
// resumo do dia), com o mesmo título e a mesma legenda.
export function GroupBox({ label, children }: GroupBoxProps) {
    return (
        <div className="group-box">
            <div className="group-box__header">
                <span className="group-box__title">
                    <span aria-hidden="true">⛓</span> {label}
                </span>
                <span className="group-box__caption">{GROUP_CAPTION}</span>
            </div>
            {children}
        </div>
    )
}
