import { z } from "zod/v4";

export const CommandOptionsSchema = z.object({
    prod: z.boolean(),
    next: z.boolean(),
    experimental: z.boolean(),
    sinceStart: z.boolean(),
});

export type OptionsType = z.infer<typeof CommandOptionsSchema>;



