export function canonicalizeJson(value: unknown): string {
    return JSON.stringify(sortKeysDeep(value))
}

export async function sha256Hex(text: string): Promise<string> {
    const encodedText = new TextEncoder().encode(text)
    const digest = await crypto.subtle.digest('SHA-256', encodedText)
    const hexDigest = Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')

    return hexDigest
}

function sortKeysDeep(value: unknown): unknown {
    if (Array.isArray(value)) {
        const sortedArray = value.map((item) => sortKeysDeep(item))
        return sortedArray
    }

    const isPlainObject = typeof value === 'object' && value !== null
    if (!isPlainObject) {
        return value
    }

    const sortedEntries = Object.entries(value as Record<string, unknown>)
        .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
        .map(([key, entryValue]) => [key, sortKeysDeep(entryValue)] as const)

    return Object.fromEntries(sortedEntries)
}
