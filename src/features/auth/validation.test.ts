import { describe, expect, it } from 'vitest'
import { fieldErrors, resetPasswordSchema, signInSchema, signUpSchema } from './validation'

describe('sign-up validation', () => {
  it('rejects a short password and a bad email, field by field', () => {
    const result = signUpSchema.safeParse({
      firstName: 'Maya',
      lastName: '',
      email: 'not-an-email',
      password: 'abc',
    })
    expect(result.success).toBe(false)
    const errors = fieldErrors(result)
    expect(errors.lastName).toBeTruthy()
    expect(errors.email).toBeTruthy()
    expect(errors.password).toContain('8 characters')
    expect(errors.firstName).toBeUndefined()
  })

  it('accepts and trims a valid payload', () => {
    const result = signUpSchema.safeParse({
      firstName: ' Maya ',
      lastName: 'Reyes',
      email: ' maya@example.com ',
      password: 'longenough1',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.firstName).toBe('Maya')
      expect(result.data.email).toBe('maya@example.com')
    }
  })
})

describe('sign-in validation', () => {
  it('requires both fields', () => {
    const errors = fieldErrors(signInSchema.safeParse({ email: '', password: '' }))
    expect(errors.email).toBeTruthy()
    expect(errors.password).toBeTruthy()
  })
})

describe('password reset validation', () => {
  it('flags a mismatch on the confirmation field', () => {
    const errors = fieldErrors(
      resetPasswordSchema.safeParse({ password: 'longenough1', confirm: 'different1' }),
    )
    expect(errors.confirm).toBe('Passwords do not match')
  })

  it('accepts matching passwords', () => {
    expect(
      resetPasswordSchema.safeParse({ password: 'longenough1', confirm: 'longenough1' }).success,
    ).toBe(true)
  })
})
