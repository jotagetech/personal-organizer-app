import { useId, useState } from 'react'

type PlanSwitchConfirmProps = {
    currentPlanName: string
    nextPlanName: string
    confirmLabel: string
    isBusy: boolean
    onConfirm: (choice: { restartCycle: boolean }) => void
    onCancel: () => void
}

// Trocar o plano ativo não apaga nada, mas muda o treino sugerido de todo dia
// seguinte; por isso a troca sempre passa por esta caixa, seja pela
// importação de um arquivo, seja pela volta a um plano guardado.
export function PlanSwitchConfirm({
    currentPlanName,
    nextPlanName,
    confirmLabel,
    isBusy,
    onConfirm,
    onCancel,
}: PlanSwitchConfirmProps) {
    const restartCycleId = useId()
    const [restartCycle, setRestartCycle] = useState(true)

    return (
        <div className="plan-switch-confirm" role="alertdialog" aria-label="Trocar o plano ativo">
            <strong className="plan-switch-confirm__title">Trocar o plano ativo?</strong>
            <p className="plan-switch-confirm__line">
                Sai: <span className="plan-switch-confirm__plan">{currentPlanName}</span>
            </p>
            <p className="plan-switch-confirm__line">
                Entra: <span className="plan-switch-confirm__plan">{nextPlanName}</span>
            </p>
            <p className="text-small text-secondary">
                O plano que sai fica guardado em Menu › Planos de treino, e o histórico dos treinos feitos
                com ele não muda.
            </p>
            <label className="builder-check" htmlFor={restartCycleId}>
                <input
                    id={restartCycleId}
                    type="checkbox"
                    checked={restartCycle}
                    onChange={(event) => setRestartCycle(event.target.checked)}
                />
                <span>
                    Começar ciclo novo hoje
                    <span className="builder-hint">Volta para o Dia 1 e para a semana 1 do bloco.</span>
                </span>
            </label>
            <div className="form-actions">
                <button type="button" className="secondary-button" onClick={onCancel} disabled={isBusy}>
                    Cancelar
                </button>
                <button
                    type="button"
                    className="primary-button"
                    onClick={() => onConfirm({ restartCycle })}
                    disabled={isBusy}
                >
                    {isBusy ? 'Trocando...' : confirmLabel}
                </button>
            </div>
        </div>
    )
}
