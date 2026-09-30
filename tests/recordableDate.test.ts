import { describe, expect, it } from 'vitest'

import {
    isRecordableSessionDate,
    recordingLockNotice,
    resolveRecordingLock,
} from '@/features/workout/recordableDate'

const TODAY = '2026-09-29'

describe('isRecordableSessionDate', () => {
    it('aceita hoje', () => {
        expect(isRecordableSessionDate(TODAY, TODAY)).toBe(true)
    })

    it('aceita dias passados, inclusive de outro mês e ano', () => {
        expect(isRecordableSessionDate('2026-09-28', TODAY)).toBe(true)
        expect(isRecordableSessionDate('2026-08-31', TODAY)).toBe(true)
        expect(isRecordableSessionDate('2025-12-31', TODAY)).toBe(true)
    })

    it('recusa qualquer dia depois de hoje', () => {
        expect(isRecordableSessionDate('2026-09-30', TODAY)).toBe(false)
        expect(isRecordableSessionDate('2026-10-01', TODAY)).toBe(false)
        expect(isRecordableSessionDate('2027-01-01', TODAY)).toBe(false)
    })
})

describe('resolveRecordingLock', () => {
    it('sem trava em hoje e no passado', () => {
        expect(resolveRecordingLock(TODAY, TODAY, false)).toBeNull()
        expect(resolveRecordingLock('2026-09-01', TODAY, false)).toBeNull()
    })

    it('trava por data futura', () => {
        expect(resolveRecordingLock('2026-09-30', TODAY, false)).toBe('futuro')
    })

    it('a exclusão na janela de desfazer trava em qualquer data', () => {
        expect(resolveRecordingLock(TODAY, TODAY, true)).toBe('excluindo')
        expect(resolveRecordingLock('2026-09-30', TODAY, true)).toBe('excluindo')
    })

    it('cada trava tem o seu aviso, e sem trava não há aviso', () => {
        expect(recordingLockNotice('futuro')).toMatch(/próprio dia/)
        expect(recordingLockNotice('excluindo')).toMatch(/Desfazer/)
        expect(recordingLockNotice(null)).toBeNull()
    })
})
