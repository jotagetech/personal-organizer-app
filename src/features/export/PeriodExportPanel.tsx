import { useState } from 'react'

import { fetchPeriodExportData } from '@/features/export/api'
import { buildPeriodExport, exportFileName, summarizePeriodExport } from '@/features/export/buildPeriodExport'
import {
    PERIOD_SHORTCUTS,
    PERIOD_SHORTCUT_LABELS,
    resolvePeriodShortcut,
    validatePeriod,
    type ExportPeriod,
} from '@/features/export/period'
import { todayInTimezone } from '@/lib/dateUtils'

type PeriodExportPanelProps = {
    onClose: () => void
}

type GeneratedExport = {
    json: string
    fileName: string
    summary: string
}

const FEEDBACK_VISIBLE_MS = 2500

export function PeriodExportPanel({ onClose }: PeriodExportPanelProps) {
    const [period, setPeriod] = useState<ExportPeriod>(() => resolvePeriodShortcut('this_week', todayInTimezone()))
    const [isGenerating, setIsGenerating] = useState(false)
    const [generated, setGenerated] = useState<GeneratedExport | null>(null)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [feedback, setFeedback] = useState<string | null>(null)
    const [showManualCopy, setShowManualCopy] = useState(false)

    const validationError = validatePeriod(period)
    const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

    // Um resultado gerado pra outro período não pode ficar na tela como se
    // fosse do período novo.
    function changePeriod(nextPeriod: ExportPeriod) {
        setPeriod(nextPeriod)
        setGenerated(null)
        setErrorMessage(null)
        setFeedback(null)
        setShowManualCopy(false)
    }

    function showFeedback(message: string) {
        setFeedback(message)
        window.setTimeout(() => setFeedback((current) => (current === message ? null : current)), FEEDBACK_VISIBLE_MS)
    }

    async function handleGenerate() {
        if (validationError) {
            return
        }

        setIsGenerating(true)
        setErrorMessage(null)
        setFeedback(null)
        setShowManualCopy(false)
        try {
            const { raw, meta } = await fetchPeriodExportData(period)
            const periodExport = buildPeriodExport(raw, period, { ...meta, generatedAt: new Date().toISOString() })
            setGenerated({
                json: JSON.stringify(periodExport, null, 2),
                fileName: exportFileName(period),
                summary: summarizePeriodExport(periodExport),
            })
        } catch (error) {
            setGenerated(null)
            setErrorMessage(`Não foi possível gerar a exportação: ${error instanceof Error ? error.message : String(error)}`)
        } finally {
            setIsGenerating(false)
        }
    }

    async function handleCopy(json: string) {
        try {
            await navigator.clipboard.writeText(json)
            setShowManualCopy(false)
            showFeedback('Copiado')
        } catch {
            setShowManualCopy(true)
            setErrorMessage('Não deu pra copiar automaticamente. Selecione o texto abaixo e copie.')
        }
    }

    async function handleShare(exported: GeneratedExport) {
        const file = new File([exported.json], exported.fileName, { type: 'application/json' })
        try {
            if (navigator.canShare?.({ files: [file] })) {
                await navigator.share({ files: [file], title: exported.fileName })
            } else {
                await navigator.share({ text: exported.json, title: exported.fileName })
            }
        } catch (error) {
            const userCancelled = error instanceof DOMException && error.name === 'AbortError'
            if (!userCancelled) {
                setErrorMessage(`Não foi possível compartilhar: ${error instanceof Error ? error.message : String(error)}`)
            }
        }
    }

    function handleDownload(exported: GeneratedExport) {
        const blob = new Blob([exported.json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = exported.fileName
        document.body.appendChild(link)
        link.click()
        link.remove()
        // Revogar na hora cancela o download em alguns navegadores móveis.
        window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
    }

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h2 style={{ fontSize: 16, margin: 0 }}>Exportar período</h2>
                <button type="button" className="secondary-button" onClick={onClose}>
                    Fechar
                </button>
            </div>
            <p className="menu-section__subtitle">
                Gera um arquivo JSON com todos os registros do período, para analisar em outra ferramenta.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginBottom: 10 }}>
                {PERIOD_SHORTCUTS.map((shortcut) => (
                    <button
                        key={shortcut}
                        type="button"
                        className="secondary-button"
                        onClick={() => changePeriod(resolvePeriodShortcut(shortcut, todayInTimezone()))}
                    >
                        {PERIOD_SHORTCUT_LABELS[shortcut]}
                    </button>
                ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                <div className="field">
                    <label htmlFor="export-start">Início</label>
                    <input
                        id="export-start"
                        type="date"
                        value={period.start}
                        onChange={(event) => changePeriod({ ...period, start: event.target.value })}
                    />
                </div>
                <div className="field">
                    <label htmlFor="export-end">Fim</label>
                    <input
                        id="export-end"
                        type="date"
                        value={period.end}
                        onChange={(event) => changePeriod({ ...period, end: event.target.value })}
                    />
                </div>
            </div>
            {validationError && <div className="error-list">{validationError}</div>}
            <button
                type="button"
                className="primary-button"
                style={{ width: '100%', marginBottom: 12 }}
                disabled={validationError !== null || isGenerating}
                onClick={() => void handleGenerate()}
            >
                {isGenerating ? 'Gerando...' : 'Gerar'}
            </button>
            {errorMessage && <div className="error-list">{errorMessage}</div>}
            {generated && (
                <div className="card">
                    <p style={{ margin: '0 0 10px', fontSize: 14 }}>{generated.summary}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        <button type="button" className="primary-button" onClick={() => void handleCopy(generated.json)}>
                            Copiar
                        </button>
                        {canShare && (
                            <button type="button" className="secondary-button" onClick={() => void handleShare(generated)}>
                                Compartilhar
                            </button>
                        )}
                        <button type="button" className="secondary-button" onClick={() => handleDownload(generated)}>
                            Baixar .json
                        </button>
                    </div>
                    {feedback && (
                        <p className="save-status" style={{ margin: '8px 0 0' }} role="status">
                            {feedback}
                        </p>
                    )}
                    {showManualCopy && (
                        <div className="field" style={{ marginTop: 10, marginBottom: 0 }}>
                            <label htmlFor="export-json">JSON gerado</label>
                            <textarea
                                id="export-json"
                                readOnly
                                rows={8}
                                value={generated.json}
                                onFocus={(event) => event.target.select()}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
