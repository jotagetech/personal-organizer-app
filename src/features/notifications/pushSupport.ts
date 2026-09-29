// Regras puras das notificações: conversão da chave VAPID e o que a tela de
// ativação mostra conforme o que o navegador oferece.

// Chave pública VAPID não comprimida: 0x04 seguido das coordenadas X e Y de
// 32 bytes cada, no formato que o pushManager.subscribe espera.
const VAPID_PUBLIC_KEY_LENGTH = 65
const UNCOMPRESSED_POINT_PREFIX = 0x04

export function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
    const trimmed = base64Url.trim()
    const padding = '='.repeat((4 - (trimmed.length % 4)) % 4)
    const base64 = (trimmed + padding).replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index)
    }

    return bytes
}

export function vapidPublicKeyToBytes(publicKey: string): Uint8Array<ArrayBuffer> {
    let bytes: Uint8Array<ArrayBuffer>
    try {
        bytes = urlBase64ToUint8Array(publicKey)
    } catch {
        throw new Error('Chave pública VAPID ilegível')
    }
    if (bytes.length !== VAPID_PUBLIC_KEY_LENGTH || bytes[0] !== UNCOMPRESSED_POINT_PREFIX) {
        throw new Error('Chave pública VAPID inválida')
    }

    return bytes
}

export type PushAvailability = 'nao_suportado' | 'abrir_pela_tela_de_inicio' | 'bloqueado' | 'disponivel'

export type PushEnvironment = {
    supportsPush: boolean
    isStandalone: boolean
    isAppleMobile: boolean
    permission: NotificationPermission | null
}

// No iPhone o Safari só expõe o PushManager ao app aberto pelo ícone da tela
// de início; fora dele a falta de suporte tem conserto, e a tela explica como.
export function resolvePushAvailability(environment: PushEnvironment): PushAvailability {
    if (!environment.supportsPush) {
        const canFixByInstalling = environment.isAppleMobile && !environment.isStandalone
        return canFixByInstalling ? 'abrir_pela_tela_de_inicio' : 'nao_suportado'
    }
    if (environment.permission === 'denied') {
        return 'bloqueado'
    }

    return 'disponivel'
}
