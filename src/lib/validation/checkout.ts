import { z } from 'zod';

import type { StudentIdMode } from '@/types/domain';

const NAME_PATTERN = /^[\p{L}\p{M}\p{N} .'-]+$/u;
const STUDENT_ID_PATTERN = /^[A-Za-z0-9 ./_-]+$/;

/** Only the essentials: a name to call out at the counter and, if the college requires it, an ID. */
export function checkoutDetailsSchema(mode: StudentIdMode, studentIdLabel: string) {
  const studentId = z
    .string()
    .trim()
    .max(40, `${studentIdLabel} must be at most 40 characters.`)
    .refine((value) => value === '' || STUDENT_ID_PATTERN.test(value), {
      message: `${studentIdLabel} may only contain letters, numbers, spaces and . / _ -`,
    });

  return z.object({
    customerName: z
      .string()
      .trim()
      .min(2, 'Please enter at least 2 characters.')
      .max(40, 'Please keep your name under 40 characters.')
      .regex(NAME_PATTERN, "Use letters, numbers, spaces, apostrophes, dots or hyphens."),
    studentIdentifier:
      mode === 'required' ? studentId.refine((value) => value.length > 0, { message: `${studentIdLabel} is required.` }) : studentId,
    acceptTerms: z.boolean().refine((value) => value, { message: 'Please accept the ordering terms to continue.' }),
  });
}

export type CheckoutDetails = z.infer<ReturnType<typeof checkoutDetailsSchema>>;
