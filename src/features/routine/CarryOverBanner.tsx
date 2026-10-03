import { useState } from 'react'

type CarryOverBannerProps = {
    titles: string[]
    onBringForward: () => Promise<void>
}

function bannerHeadline(count: number): string {
    return count === 1 ? '1 ficou de ontem' : `${count} ficaram de ontem`
}

export function CarryOverBanner({ titles, onBringForward }: CarryOverBannerProps) {
    const [isSubmitting, setIsSubmitting] = useState(false)

    async function handleClick() {
        setIsSubmitting(true)
        try {
            await onBringForward()
        } catch {
            // O erro já aparece na tela; a faixa continua para tentar de novo.
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="carry-over-banner">
            <div className="carry-over-banner__text">
                <p className="carry-over-banner__headline">{bannerHeadline(titles.length)}</p>
                <p className="carry-over-banner__titles">{titles.join(', ')}</p>
            </div>
            <button type="button" className="carry-over-banner__action" disabled={isSubmitting} onClick={handleClick}>
                Trazer para hoje
            </button>
        </div>
    )
}
