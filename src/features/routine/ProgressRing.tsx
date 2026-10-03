type ProgressRingProps = {
    size: number
    strokeWidth: number
    done: number
    total: number
    ariaLabel: string
    centerLabel?: string
    isMuted?: boolean
    // Cada valor novo e maior que zero reinicia a animação de comemoração.
    celebrationKey?: number
}

function fractionDone(done: number, total: number): number {
    if (total <= 0) {
        return 0
    }

    return Math.min(Math.max(done / total, 0), 1)
}

export function ProgressRing({
    size,
    strokeWidth,
    done,
    total,
    ariaLabel,
    centerLabel,
    isMuted = false,
    celebrationKey = 0,
}: ProgressRingProps) {
    const radius = (size - strokeWidth) / 2
    const circumference = 2 * Math.PI * radius
    const fraction = fractionDone(done, total)
    const center = size / 2
    const className = isMuted ? 'progress-ring progress-ring--muted' : 'progress-ring'

    return (
        <span className={className} style={{ width: size, height: size }} role="img" aria-label={ariaLabel}>
            <svg
                key={celebrationKey}
                className={celebrationKey > 0 ? 'progress-ring__svg progress-ring__svg--celebrate' : 'progress-ring__svg'}
                width={size}
                height={size}
                viewBox={`0 0 ${size} ${size}`}
                aria-hidden="true"
            >
                <circle
                    className="progress-ring__track"
                    cx={center}
                    cy={center}
                    r={radius}
                    fill="none"
                    strokeWidth={strokeWidth}
                />
                <circle
                    className="progress-ring__arc"
                    cx={center}
                    cy={center}
                    r={radius}
                    fill="none"
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference * (1 - fraction)}
                    transform={`rotate(-90 ${center} ${center})`}
                    style={{ opacity: fraction > 0 ? 1 : 0 }}
                />
            </svg>
            {centerLabel && (
                <span className="progress-ring__label" style={{ fontSize: Math.round(size * 0.26) }} aria-hidden="true">
                    {centerLabel}
                </span>
            )}
        </span>
    )
}
