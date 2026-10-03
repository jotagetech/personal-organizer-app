export const FULL_NAME_MAX_LENGTH = 80
export const NICKNAME_MAX_LENGTH = 40

type DisplayNameSources = {
    nickname: string | null | undefined
    fullName: string | null | undefined
    email: string | null | undefined
}

const MORNING_START_HOUR = 5
const AFTERNOON_START_HOUR = 12
const NIGHT_START_HOUR = 18

export function greetingForHour(hour: number): string {
    if (hour >= MORNING_START_HOUR && hour < AFTERNOON_START_HOUR) {
        return 'Bom dia'
    }
    if (hour >= AFTERNOON_START_HOUR && hour < NIGHT_START_HOUR) {
        return 'Boa tarde'
    }

    return 'Boa noite'
}

// Parte do e-mail antes do @, com a primeira letra maiúscula. Sem e-mail
// utilizável devolve null.
export function greetingNameFromEmail(email: string | null | undefined): string | null {
    const localPart = (email ?? '').split('@')[0].trim()
    if (localPart === '') {
        return null
    }
    const greetingName = localPart.charAt(0).toUpperCase() + localPart.slice(1)
    return greetingName
}

function firstNameOf(fullName: string | null | undefined): string | null {
    const firstName = (fullName ?? '').trim().split(/\s+/)[0]
    const resolvedName = firstName === '' ? null : firstName
    return resolvedName
}

// Apelido, senão o primeiro nome, senão o começo do e-mail; null sem nada.
export function displayNameOf({ nickname, fullName, email }: DisplayNameSources): string | null {
    const trimmedNickname = (nickname ?? '').trim()
    if (trimmedNickname !== '') {
        return trimmedNickname
    }
    const displayName = firstNameOf(fullName) ?? greetingNameFromEmail(email)
    return displayName
}

export function greetingText(hour: number, displayName: string | null): string {
    const greeting = greetingForHour(hour)
    const text = displayName ? `${greeting}, ${displayName}` : greeting
    return text
}

// Campo vazio ou só com espaços é gravado como nulo.
export function toNullableText(value: string): string | null {
    const trimmedValue = value.trim()
    const nullableValue = trimmedValue === '' ? null : trimmedValue
    return nullableValue
}
