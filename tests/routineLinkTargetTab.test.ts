import { describe, expect, it } from 'vitest'

import { ROUTINE_LINK_KIND_TARGET_TAB } from '@/features/routine/types'

describe('ROUTINE_LINK_KIND_TARGET_TAB', () => {
    it('leva peso e sono pendentes para o Menu, onde ficam os registros do dia', () => {
        expect(ROUTINE_LINK_KIND_TARGET_TAB.body_weight).toBe('menu')
        expect(ROUTINE_LINK_KIND_TARGET_TAB.sleep).toBe('menu')
    })

    it('mantém treino e refeições nas próprias abas', () => {
        expect(ROUTINE_LINK_KIND_TARGET_TAB.workout_finished).toBe('treino')
        expect(ROUTINE_LINK_KIND_TARGET_TAB['meal:almoco']).toBe('alimentacao')
    })
})
