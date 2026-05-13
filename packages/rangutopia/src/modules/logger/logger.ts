import {type Logger, pino} from "pino";
import ci from "ci-info";

let pinoLogger:  Logger<"success">;

interface LoggerConfig {
    verbose: boolean
}

export const setupLogger = (config: LoggerConfig) => {
    if (pinoLogger) throw new Error("The logger has already been set up")
    pinoLogger = pino({
        base: undefined, // set to undefined to avoid adding pid and hostname properties to each log.
        level: config.verbose ? "debug" : "info",
        customLevels: {
            success: 35 // sits between info (30) and warn (40)
        },
        transport: {
            target: 'pino-pretty',
            options: {
                colorize: true,
                customLevels: 'success:35',
                customColors: 'success:green,debug:bgWhite,info:blue',
                useOnlyCustomProps: false,
            }
        },
    })
}

export const logger = {
    info: (message: any) => pinoLogger.info(message),
    warn: (message: any) => pinoLogger.warn(message),
    error: (message: any) => pinoLogger.error(message),
    success: (message: any) => pinoLogger.success(message),
    trace: (message: any) => pinoLogger.trace(message),
    githubAction:  {
        /*
            since the GitHub Action accepts a specific format (like ::group:: at the start of the message)
            and pinoLogger messes up the message format, we use the normal console log for GitHub Actions
        */
        group:  (message: string) => {
            if (ci.GITHUB_ACTIONS)
                console.log(`::group:: ${message}`);
        },
        endGroup:  () => {
            if (ci.GITHUB_ACTIONS)
                console.log("::endgroup::");
        }
    },
    verbose: (message: any) => pinoLogger.debug(message),
    table: (message: any) => console.table(message),
};
