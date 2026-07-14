import { z } from "zod";

export const reminderRulesFormSchema = z.object({
  rules: z.array(
    z.object({
      type: z.enum(["CONSULTATION", "VACCINE", "TREATMENT", "CONTROL", "OTHER"]),
      enabled: z.boolean(),
      months: z.coerce.number().int().min(1).max(36),
    })
  ),
});
export type ReminderRulesFormInput = z.infer<typeof reminderRulesFormSchema>;
