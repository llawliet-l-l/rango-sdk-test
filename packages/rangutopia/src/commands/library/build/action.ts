import { z } from "zod/v4"
import ora from "ora";
import { logErrorAndExit, message } from "../../../utils/log.js";
import { action as checkAction } from "../check/mod.js"
import { build, type BuildResult } from "esbuild"
import { CommandOptionsSchema, parseOptions } from "./options.js";
import { objectToCliParams } from "../../../utils/cli.js";
import { findBinaryPath } from "../../../utils/fs.js";
import {logger} from "../../../modules/mod.js";
import spawn from "nano-spawn";

export async function action(commandOptions: z.infer<typeof CommandOptionsSchema>) {
        await checkAction(commandOptions);
        const options = await parseOptions(commandOptions).catch(logErrorAndExit);

        const spinner = ora(`Running Typescript and ESBuild on ${options.package.name}\n`).start();

        const tscParams = objectToCliParams(options.typescript);
        const localTsc = await findBinaryPath("tsc");

        const taskTsc = spawn(localTsc || "tsc", tscParams);

        const taskEsbuild = build(options.esbuild).catch((reason: BuildResult) => {
                throw new Error(message({ task: "esbuild" }, reason.errors.map(error => error.text).join("\n")), {
                        cause: reason
                });
        });


        await Promise.all([taskTsc, taskEsbuild]).catch((reason) => {
                spinner.stop();
                logger.error(reason.message);
                logErrorAndExit(`Building '${options.package.name}' failed.`)
        });

        spinner.succeed(`'${options.package.name}' built.`)
}

