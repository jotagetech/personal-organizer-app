// Acesso aos recursos do aparelho usados pelos cronômetros: bipe por Web Audio
// (o iOS Safari não tem vibração). Tudo falha em silêncio, porque o aviso
// visual sempre acompanha o sonoro.

// 'trabalho', 'recuperacao' e 'contagem' são as trocas de fase do intervalado:
// agudo duplo para começar a fazer força, grave duplo para aliviar e um
// toque curto em cada um dos últimos segundos da recuperação.
type BeepKind = 'faixa' | 'limite' | 'trabalho' | 'recuperacao' | 'contagem'

type AudioContextConstructor = typeof AudioContext

let audioContext: AudioContext | null = null

function getAudioContext(): AudioContext | null {
    if (audioContext) {
        return audioContext
    }
    const scope = window as unknown as {
        AudioContext?: AudioContextConstructor
        webkitAudioContext?: AudioContextConstructor
    }
    const AudioContextClass = scope.AudioContext ?? scope.webkitAudioContext
    if (!AudioContextClass) {
        return null
    }
    audioContext = new AudioContextClass()

    return audioContext
}

// O iOS só libera o áudio dentro de um gesto do usuário: chamado no toque de
// Iniciar e Confirmar, toca um instante de silêncio e deixa o contexto ativo
// para os bipes disparados depois, fora de qualquer toque.
export function unlockAudio(): void {
    try {
        const context = getAudioContext()
        if (!context) {
            return
        }
        if (context.state === 'suspended') {
            void context.resume().catch(() => undefined)
        }
        const silentSource = context.createBufferSource()
        silentSource.buffer = context.createBuffer(1, 1, context.sampleRate)
        silentSource.connect(context.destination)
        silentSource.start(0)
    } catch {
        // sem áudio: só o aviso visual
    }
}

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
    try {
        const context = getAudioContext()
        if (!context) {
            return
        }
        if (context.state === 'suspended') {
            void context.resume().catch(() => undefined)
        }
        const { frequency, count } = BEEP_PATTERNS[kind]
        for (let index = 0; index < count; index += 1) {
            const startAt = context.currentTime + index * (BEEP_DURATION_S + BEEP_GAP_S)
            const oscillator = context.createOscillator()
            const gain = context.createGain()
            oscillator.frequency.value = frequency
            gain.gain.setValueAtTime(0, startAt)
            gain.gain.linearRampToValueAtTime(BEEP_VOLUME, startAt + 0.01)
            gain.gain.linearRampToValueAtTime(0, startAt + BEEP_DURATION_S)
            oscillator.connect(gain)
            gain.connect(context.destination)
            oscillator.start(startAt)
            oscillator.stop(startAt + BEEP_DURATION_S + 0.02)
        }
    } catch {
        // sem áudio: só o aviso visual
    }
}
