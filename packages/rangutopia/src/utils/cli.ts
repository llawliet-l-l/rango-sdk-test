export function objectToCliParams(object: Record<string, unknown>): string[] {
        const iterable = Object.entries(object);
        const params: string[] = [];
        iterable.forEach(([key, value]) => {
                if (typeof value === "boolean") {
                        params.push(`--${key}`);
                } else if (typeof value === "string") {
                        params.push(`--${key}`);
                        params.push(value);
                } else {
                        throw new Error("Unhandled type. if you're maintainer, you should add the type to this function.")
                }
        });

        return params
}
