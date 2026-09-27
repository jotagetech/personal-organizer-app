import { describe, expect, it } from 'vitest'

import { canonicalizeJson, sha256Hex } from '@/lib/canonicalJson'

describe('canonicalizeJson', () => {
    it('produz o mesmo resultado independente da ordem das chaves', () => {
        const objectA = { nome: 'Plano', versao: 1, treinos: [{ id: 'a', nome: 'A' }] }
        const objectB = { versao: 1, treinos: [{ nome: 'A', id: 'a' }], nome: 'Plano' }

        expect(canonicalizeJson(objectA)).toBe(canonicalizeJson(objectB))
    })

    it('diferencia conteúdo realmente distinto', () => {
        const objectA = { nome: 'Plano A' }
        const objectB = { nome: 'Plano B' }

        expect(canonicalizeJson(objectA)).not.toBe(canonicalizeJson(objectB))
    })
})

describe('sha256Hex', () => {
    it('gera o mesmo hash para o mesmo texto', async () => {
        const hashA = await sha256Hex('conteúdo estável')
        const hashB = await sha256Hex('conteúdo estável')

        expect(hashA).toBe(hashB)
        expect(hashA).toHaveLength(64)
    })

    it('gera hashes diferentes para textos diferentes', async () => {
        const hashA = await sha256Hex('texto 1')
        const hashB = await sha256Hex('texto 2')

        expect(hashA).not.toBe(hashB)
    })
})
