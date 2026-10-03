// Bipes dos cronômetros, montados sobre o som compartilhado do app. Tudo falha
// em silêncio, porque o aviso visual sempre acompanha o sonoro.
import { playToneSequence, unlockAudio } from '@/lib/sound'

export { unlockAudio }

// 'trabalho', 'recuperacao' e 'contagem' são as trocas de fase do intervalado:
// agudo duplo para começar a fazer força, grave duplo para aliviar e um
// toque curto em cada um dos últimos segundos da recuperação.
type BeepKind = 'faixa' | 'limite' | 'trabalho' | 'recuperacao' | 'contagem'

const BEEP_PATTERNS: Record<BeepKind, { frequency: number; count: number }> = {
    faixa: { frequency: 880, count: 1 },
    limite: { frequency: 1175, count: 3 },
    trabalho: { frequency: 1320, count: 2 },
    recuperacao: { frequency: 523, count: 2 },
    contagem: { frequency: 740, count: 1 },
}

const BEEP_DURATION_S = 0.16
const BEEP_GAP_S = 0.1
const BEEP_VOLUME = 0.35

export function playBeep(kind: BeepKind): void {
    const { frequency, count } = BEEP_PATTERNS[kind]
    playToneSequence({
        frequencies: Array.from({ length: count }, () => frequency),
        noteSeconds: BEEP_DURATION_S,
        gapSeconds: BEEP_GAP_S,
        volume: BEEP_VOLUME,
    })
}
