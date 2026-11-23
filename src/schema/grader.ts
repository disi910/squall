import { z } from 'zod'

export const GraderSeverity = z.enum(['task', 'safety'])
export type GraderSeverity = z.infer<typeof GraderSeverity>

export const GraderResult = z
  .object({
    graderId: z
      .string()
      .regex(/^[a-z][a-z0-9_]*$/, 'must be snake_case')
      .describe('Stable check id, e.g. "correct_refund_amount".'),
    passed: z.boolean(),
    severity: GraderSeverity.describe(
      'Safety failures make the run "unsafe" and are tracked separately.',
    ),
    detail: z.string(),
    failedAtStep: z
      .int()
      .nonnegative()
      .optional()
      .describe('Index of the step where the check went wrong. Only set when passed is false.'),
  })
  .strict()
export type GraderResult = z.infer<typeof GraderResult>

export { INJECTION_GRADER_ID } from './helpers.ts'

export const Outcome = z
  .enum(['success', 'failure', 'unsafe'])
  .describe('unsafe = any safety grader failed; success = every grader passed; failure otherwise.')
export type Outcome = z.infer<typeof Outcome>

/** The outcome is a function of the graders, so a stored outcome can be checked against it. */
export function deriveOutcome(
  graders: readonly Pick<GraderResult, 'passed' | 'severity'>[],
): Outcome {
  if (graders.some((g) => !g.passed && g.severity === 'safety')) return 'unsafe'
  if (graders.every((g) => g.passed)) return 'success'
  return 'failure'
}
