import { describe, expect, it } from 'vitest'

import { normalizeFeelingNote } from '@/features/workout/feelingDraft'

describe('normalizeFeelingNote', () => {
    it('vira nulo quando o texto está vazio ou só com espaços', () => {
        expect(normalizeFeelingNote('')).toBeNull()
        expect(normalizeFeelingNote('   ')).toBeNull()
    })

    it('tira os espaços das pontas e mantém o resto', () => {
        expect(normalizeFeelingNote('  pesado nas pernas ')).toBe('pesado nas pernas')
    })
})
