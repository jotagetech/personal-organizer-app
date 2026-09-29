import { describe, expect, it } from 'vitest'

import {
    resolvePushAvailability,
    urlBase64ToUint8Array,
    vapidPublicKeyToBytes,
    type PushEnvironment,
} from '@/features/notifications/pushSupport'

function toBase64Url(bytes: Uint8Array): string {
    return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function samplePublicKeyBytes(): Uint8Array {
    const bytes = new Uint8Array(65)
    bytes[0] = 0x04
    for (let index = 1; index < bytes.length; index += 1) {
        bytes[index] = (index * 37) % 256
    }

    return bytes
}

describe('urlBase64ToUint8Array', () => {
    it('decodifica base64url sem padding e com o alfabeto próprio da URL', () => {
        const bytes = new Uint8Array([0xfb, 0xff, 0xbf, 0x00, 0x01])

        expect(Array.from(urlBase64ToUint8Array(toBase64Url(bytes)))).toEqual(Array.from(bytes))
    })

    it('aceita espaços nas pontas', () => {
        expect(Array.from(urlBase64ToUint8Array('  AQID '))).toEqual([1, 2, 3])
    })
})

describe('vapidPublicKeyToBytes', () => {
    it('devolve os 65 bytes da chave pública não comprimida', () => {
        const expected = samplePublicKeyBytes()

        expect(Array.from(vapidPublicKeyToBytes(toBase64Url(expected)))).toEqual(Array.from(expected))
    })

    it('recusa chave com tamanho errado', () => {
        expect(() => vapidPublicKeyToBytes(toBase64Url(new Uint8Array(32)))).toThrow('Chave pública VAPID inválida')
    })

    it('recusa chave sem o prefixo de ponto não comprimido', () => {
        const bytes = samplePublicKeyBytes()
        bytes[0] = 0x02

        expect(() => vapidPublicKeyToBytes(toBase64Url(bytes))).toThrow('Chave pública VAPID inválida')
    })

    it('recusa texto que não é base64', () => {
        expect(() => vapidPublicKeyToBytes('###')).toThrow('Chave pública VAPID ilegível')
    })
})

describe('resolvePushAvailability', () => {
    const installedIphone: PushEnvironment = {
        supportsPush: true,
        isStandalone: true,
        isAppleMobile: true,
        permission: 'default',
    }

    it('fica disponível no app instalado, antes e depois de conceder', () => {
        expect(resolvePushAvailability(installedIphone)).toBe('disponivel')
        expect(resolvePushAvailability({ ...installedIphone, permission: 'granted' })).toBe('disponivel')
    })

    it('mostra bloqueado quando a permissão foi negada', () => {
        expect(resolvePushAvailability({ ...installedIphone, permission: 'denied' })).toBe('bloqueado')
    })

    it('pede para abrir pela tela de início no Safari do iPhone', () => {
        const safariTab: PushEnvironment = {
            supportsPush: false,
            isStandalone: false,
            isAppleMobile: true,
            permission: null,
        }

        expect(resolvePushAvailability(safariTab)).toBe('abrir_pela_tela_de_inicio')
    })

    it('não suportado no app instalado sem push (iOS antigo) ou fora da Apple', () => {
        expect(resolvePushAvailability({ ...installedIphone, supportsPush: false })).toBe('nao_suportado')
        expect(
            resolvePushAvailability({
                supportsPush: false,
                isStandalone: false,
                isAppleMobile: false,
                permission: null,
            }),
        ).toBe('nao_suportado')
    })
})
