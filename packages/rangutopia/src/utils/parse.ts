import { z, ZodError } from "zod/v4"

export function validatedSchemaOrThrow<T extends z.ZodTypeAny>(schema: T, data: unknown): z.output<T> {
        try {
                const output = schema.parse(data);
                return output;
        } catch (e) {

                if (e instanceof ZodError) {
                        const message = e.issues.map(issue => `${issue.message} in ${issue.path.join(",")}`).join("\n");
                        throw Error(message, { cause: e })
                }

                throw e
        }
}



