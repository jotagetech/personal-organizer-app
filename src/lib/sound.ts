// Som por Web Audio, compartilhado pelos avisos do app (o iOS Safari não tem
// vibração). Tudo falha em silêncio, porque o aviso visual sempre acompanha o
// sonoro.

type AudioContextConstructor = typeof AudioContext

type AudioSessionType = 'auto' | 'playback' | 'ambient'

type NavigatorWithAudioSession = Navigator & { audioSession?: { type: AudioSessionType } }

export type ToneSequence = {
    frequencies: number[]
    noteSeconds: number
    gapSeconds: number
    volume: number
    // Com a chave de silencioso do iPhone ligada, uma sequência "ambient" fica muda.
    respectsSilentSwitch?: boolean
}

const ATTACK_SECONDS = 0.01
const STOP_MARGIN_SECONDS = 0.02

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

function resumeIfSuspended(context: AudioContext): void {
    if (context.state === 'suspended') {
        void context.resume().catch(() => undefined)
    }
}

// Onde a API existe, escolhe se o som obedece à chave de silencioso. Sem a
// API o navegador decide sozinho.
function applyAudioSessionType(type: AudioSessionType): void {
    const audioSession = (navigator as NavigatorWithAudioSession).audioSession
    if (audioSession) {
        audioSession.type = type
    }
}

// O iOS só libera o áudio dentro de um gesto do usuário: chamado no toque que
// antecede o som, toca um instante de silêncio e deixa o contexto ativo para
// os sons disparados depois, fora de qualquer toque.
export function unlockAudio(): void {
    try {
        const context = getAudioContext()
        if (!context) {
            return
        }
        resumeIfSuspended(context)
        const silentSource = context.createBufferSource()
        silentSource.buffer = context.createBuffer(1, 1, context.sampleRate)
        silentSource.connect(context.destination)
        silentSource.start(0)
    } catch {
        // sem áudio: só o aviso visual
    }
}

function scheduleNote(context: AudioContext, frequency: number, startAt: number, sequence: ToneSequence): void {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0, startAt)
    gain.gain.linearRampToValueAtTime(sequence.volume, startAt + ATTACK_SECONDS)
    gain.gain.linearRampToValueAtTime(0, startAt + sequence.noteSeconds)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(startAt)
    oscillator.stop(startAt + sequence.noteSeconds + STOP_MARGIN_SECONDS)
}

export function playToneSequence(sequence: ToneSequence): void {
    try {
        const context = getAudioContext()
        if (!context) {
            return
        }
        applyAudioSessionType(sequence.respectsSilentSwitch ? 'ambient' : 'auto')
        resumeIfSuspended(context)
        sequence.frequencies.forEach((frequency, index) => {
            const startAt = context.currentTime + index * (sequence.noteSeconds + sequence.gapSeconds)
            scheduleNote(context, frequency, startAt, sequence)
        })
    } catch {
        // sem áudio: só o aviso visual
    }
}

// Arpejo subindo (dó, mi, sol), meio segundo no total e em volume moderado.
const CELEBRATION_SEQUENCE: ToneSequence = {
    frequencies: [523, 659, 784],
    noteSeconds: 0.14,
    gapSeconds: 0.04,
    volume: 0.25,
    respectsSilentSwitch: true,
}

export function playCelebration(): void {
    playToneSequence(CELEBRATION_SEQUENCE)
}
