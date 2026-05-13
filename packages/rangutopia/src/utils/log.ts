import {logger} from "../modules/mod.js";

export function logErrorAndExit(message: string): never {
  logger.error(message);
  process.exit(1);
}


interface MessageContext {
        task: "tsc" | "esbuild";
}

export function message(context: MessageContext, message: string) {
        return `[${context.task}] ${message}`;
}

