import { describe, expect, it } from 'vitest'

import {
    displayNameOf,
    greetingForHour,
    greetingNameFromEmail,
    greetingText,
    toNullableText,
} from '@/features/account/profileGreeting'

describe('greetingForHour', () => {
    it('cumprimenta por faixa de hora', () => {
        expect(greetingForHour(5)).toBe('Bom dia')
        expect(greetingForHour(11)).toBe('Bom dia')
        expect(greetingForHour(12)).toBe('Boa tarde')
        expect(greetingForHour(17)).toBe('Boa tarde')
        expect(greetingForHour(18)).toBe('Boa noite')
        expect(greetingForHour(23)).toBe('Boa noite')
        expect(greetingForHour(0)).toBe('Boa noite')
        expect(greetingForHour(4)).toBe('Boa noite')
    })
})

describe('greetingNameFromEmail', () => {
    it('usa a parte antes do @ com a primeira letra maiúscula', () => {
        expect(greetingNameFromEmail('gustavo@exemplo.com')).toBe('Gustavo')
    })

    it('sem e-mail devolve null', () => {
        expect(greetingNameFromEmail(undefined)).toBeNull()
        expect(greetingNameFromEmail('')).toBeNull()
        expect(greetingNameFromEmail('@exemplo.com')).toBeNull()
    })
})

describe('displayNameOf', () => {
    const email = 'maria@exemplo.com'

    it('prefere o apelido', () => {
        expect(displayNameOf({ nickname: ' Gu ', fullName: 'Gustavo Silva', email })).toBe('Gu')
    })

    it('sem apelido usa o primeiro nome', () => {
        expect(displayNameOf({ nickname: null, fullName: '  Gustavo   Silva ', email })).toBe('Gustavo')
        expect(displayNameOf({ nickname: '   ', fullName: 'Gustavo Silva', email })).toBe('Gustavo')
    })

    it('sem nomes usa o começo do e-mail', () => {
        expect(displayNameOf({ nickname: null, fullName: '  ', email })).toBe('Maria')
    })

    it('sem nada devolve null', () => {
        expect(displayNameOf({ nickname: null, fullName: null, email: null })).toBeNull()
        expect(displayNameOf({ nickname: '', fullName: '', email: '' })).toBeNull()
    })
})

describe('greetingText', () => {
    it('inclui o nome quando existe', () => {
        expect(greetingText(9, 'Gustavo')).toBe('Bom dia, Gustavo')
    })

    it('sem nome devolve só a saudação', () => {
        expect(greetingText(20, null)).toBe('Boa noite')
    })
})

describe('toNullableText', () => {
    it('apara espaços e vazio vira null', () => {
        expect(toNullableText('  Gu ')).toBe('Gu')
        expect(toNullableText('   ')).toBeNull()
    })
})
