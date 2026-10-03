// Pular a primeira vez vale só enquanto o app está aberto: o valor mora na
// memória do módulo e some quando a página é carregada de novo.
let wasSkipped = false

export function markRoutineOnboardingSkipped(): void {
    wasSkipped = true
}

export function wasRoutineOnboardingSkipped(): boolean {
    const skipped = wasSkipped
    return skipped
}
