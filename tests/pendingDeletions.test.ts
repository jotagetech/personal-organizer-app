import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createPendingDeletionsStore, DEFAULT_UNDO_DELAY_MS } from '@/lib/pendingDeletions'

beforeEach(() => {
    vi.useFakeTimers()
})

afterEach(() => {
    vi.useRealTimers()
})

describe('createPendingDeletionsStore', () => {
    it('chama o commit uma vez depois do tempo expirar', async () => {
        const commit = vi.fn().mockResolvedValue(undefined)
        const store = createPendingDeletionsStore()

        store.scheduleDeletion({ id: '1', label: 'Item', commit })

        expect(commit).not.toHaveBeenCalled()
        expect(store.isPendingDeletion('1')).toBe(true)

        await vi.advanceTimersByTimeAsync(DEFAULT_UNDO_DELAY_MS)

        expect(commit).toHaveBeenCalledTimes(1)
        expect(store.isPendingDeletion('1')).toBe(false)
    })

    it('nunca chama o commit quando a exclusão é desfeita antes do tempo acabar', async () => {
        const commit = vi.fn().mockResolvedValue(undefined)
        const store = createPendingDeletionsStore()

        store.scheduleDeletion({ id: '1', label: 'Item', commit })
        store.undoDeletion('1')

        await vi.advanceTimersByTimeAsync(DEFAULT_UNDO_DELAY_MS)

        expect(commit).not.toHaveBeenCalled()
        expect(store.isPendingDeletion('1')).toBe(false)
    })

    it('restaura o item quando o commit falha', async () => {
        const commit = vi.fn().mockRejectedValue(new Error('falhou'))
        const onRestored = vi.fn()
        const store = createPendingDeletionsStore()

        store.scheduleDeletion({ id: '1', label: 'Item', commit, onRestored })

        await vi.advanceTimersByTimeAsync(DEFAULT_UNDO_DELAY_MS)

        expect(commit).toHaveBeenCalledTimes(1)
        expect(onRestored).toHaveBeenCalledTimes(1)
        expect(onRestored).toHaveBeenCalledWith('falhou')
        expect(store.isPendingDeletion('1')).toBe(false)
    })

    it('trata duas exclusões agendadas ao mesmo tempo de forma independente', async () => {
        const commitA = vi.fn().mockResolvedValue(undefined)
        const commitB = vi.fn().mockResolvedValue(undefined)
        const store = createPendingDeletionsStore()

        store.scheduleDeletion({ id: 'a', label: 'Item A', commit: commitA })
        store.scheduleDeletion({ id: 'b', label: 'Item B', commit: commitB })
        store.undoDeletion('a')

        await vi.advanceTimersByTimeAsync(DEFAULT_UNDO_DELAY_MS)

        expect(commitA).not.toHaveBeenCalled()
        expect(commitB).toHaveBeenCalledTimes(1)
        expect(store.isPendingDeletion('a')).toBe(false)
        expect(store.isPendingDeletion('b')).toBe(false)
    })

    it('comita todas as pendências imediatamente quando a página fica oculta', async () => {
        vi.useRealTimers()

        const commitA = vi.fn().mockResolvedValue(undefined)
        const commitB = vi.fn().mockResolvedValue(undefined)
        const store = createPendingDeletionsStore()

        store.scheduleDeletion({ id: 'a', label: 'Item A', commit: commitA })
        store.scheduleDeletion({ id: 'b', label: 'Item B', commit: commitB })

        store.flushAllPending()
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(commitA).toHaveBeenCalledTimes(1)
        expect(commitB).toHaveBeenCalledTimes(1)
        expect(store.isPendingDeletion('a')).toBe(false)
        expect(store.isPendingDeletion('b')).toBe(false)
    })
})
