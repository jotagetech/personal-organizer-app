export type MetricParseResult = { valid: true; value: number } | { valid: false; errorMessage: string }

const INVALID_NUMBER_MESSAGE = 'Informe um número válido.'

// Extraído do formulário de registro rápido pra poder testar as regras de
// validação sem montar componente nenhum: aceita vírgula ou ponto decimal
// (teclado numérico de celular manda vírgula na maioria dos idiomas), rejeita
// valor zero ou negativo, e opcionalmente um teto (sono não passa de 24h no
// dia, peso não tem teto natural).
export function parseMetricValue(rawText: string, maxValue?: number): MetricParseResult {
    const normalizedText = rawText.trim().replace(',', '.')
    const value = Number(normalizedText)

    if (!Number.isFinite(value) || value <= 0) {
        return { valid: false, errorMessage: INVALID_NUMBER_MESSAGE }
    }

    if (maxValue !== undefined && value > maxValue) {
        return { valid: false, errorMessage: `Informe um valor até ${maxValue}.` }
    }

    return { valid: true, value }
}
