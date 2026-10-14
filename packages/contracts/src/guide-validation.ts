import { z } from "zod";

export const guideReferenceReagentSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().positive(),
});

export const guideReferenceStepSchema = z
  .object({
    startSkill: z.number().int().nonnegative(),
    endSkill: z.number().int().positive(),
    recipeName: z.string().min(1),
    expectedCrafts: z.number().positive().optional(),
    reagents: z.array(guideReferenceReagentSchema).optional(),
    notes: z.string().min(1).optional(),
  })
  .refine(({ startSkill, endSkill }) => endSkill > startSkill, {
    message: "Guide reference steps must end after they start.",
  });

export const guideReferenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().min(1),
    title: z.string().min(1),
    professionId: z.string().min(1),
    startSkill: z.number().int().nonnegative(),
    targetSkill: z.number().int().positive(),
    optimizationIntent: z.enum([
      "fewest-crafts",
      "material-cost-proxy",
      "gold-cost",
      "practical",
      "unknown",
    ]),
    source: z.object({
      publisher: z.string().min(1),
      url: z.url(),
      capturedAt: z.iso.datetime(),
      sourceBuildId: z.string().min(1).optional(),
      notes: z.string().min(1).optional(),
    }),
    assumptions: z.array(z.string().min(1)),
    steps: z.array(guideReferenceStepSchema).min(1),
  })
  .superRefine(({ startSkill, targetSkill, steps }, context) => {
    if (targetSkill <= startSkill) {
      context.addIssue({
        code: "custom",
        path: ["targetSkill"],
        message: "Guide target skill must be greater than its start skill.",
      });
    }

    let expectedStart = startSkill;
    steps.forEach((step, index) => {
      if (step.startSkill !== expectedStart) {
        context.addIssue({
          code: "custom",
          path: ["steps", index, "startSkill"],
          message: `Guide steps must be contiguous; expected ${expectedStart}.`,
        });
      }
      expectedStart = step.endSkill;
    });

    if (expectedStart !== targetSkill) {
      context.addIssue({
        code: "custom",
        path: ["steps"],
        message: `Guide steps must finish at target skill ${targetSkill}.`,
      });
    }
  });

export type GuideReference = z.infer<typeof guideReferenceSchema>;
export type GuideReferenceReagent = z.infer<typeof guideReferenceReagentSchema>;
export type GuideReferenceStep = z.infer<typeof guideReferenceStepSchema>;
