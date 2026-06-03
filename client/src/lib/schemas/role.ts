import { z } from "zod";

export const roleCreateSchema = z.object({
  role_name: z.string().min(1, "Required").max(80),
  business: z.string().nullable().optional(),
  description: z.string().max(280).optional().or(z.literal("")),
  clone_from_role_id: z.string().uuid().optional().or(z.literal("")),
});
export type RoleCreateValues = z.infer<typeof roleCreateSchema>;
