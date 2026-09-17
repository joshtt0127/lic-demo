import { z } from 'zod'

/** Shared form schemas — the UI shows `flatten().fieldErrors` under each field. */

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .email('Enter a valid email address')

export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(72, 'Passwords cap at 72 characters')

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
})

export const signUpSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
  email: emailSchema,
  password: passwordSchema,
})

export const forgotPasswordSchema = z.object({ email: emailSchema })

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirm: z.string().min(1, 'Confirm your password'),
  })
  .refine((value) => value.password === value.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match',
  })

/** Field-keyed errors from a failed `safeParse`, ready for the form state. */
export function fieldErrors<T extends z.ZodType>(
  result: z.ZodSafeParseResult<z.output<T>>,
): Record<string, string> {
  if (result.success) return {}
  const out: Record<string, string> = {}
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? 'form')
    if (!out[key]) out[key] = issue.message
  }
  return out
}
