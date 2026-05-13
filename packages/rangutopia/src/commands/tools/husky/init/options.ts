import { z } from "zod/v4"
import { validatedSchemaOrThrow } from "../../../../utils/parse.js";

export const CommandOptionsSchema = z.object({
        silent: z.boolean()
});

interface ParsedOptions {
        silent: boolean
}

export async function parseOptions(
        commandOptions: z.infer<typeof CommandOptionsSchema>
): Promise<ParsedOptions> {
        const options = validatedSchemaOrThrow(CommandOptionsSchema, commandOptions);
        return options
}
