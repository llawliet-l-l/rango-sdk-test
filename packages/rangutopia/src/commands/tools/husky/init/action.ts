import { z } from "zod/v4"
import path from "node:path";
import { findMissingDependencies, nearestPackageJsonPath, readPackageJson, updatePackageJson } from "../../../../utils/packageJson.js"
import {yarnCommands} from "../../../../utils/yarn.js"
import { copyDir, findBinaryPath } from "../../../../utils/fs.js"
import { HUSKY_TEMPLATES_PATH, ROOT_PATH } from "../../../../constants.js"
import ora from "ora";
import { CommandOptionsSchema, parseOptions } from "./options.js";
import { logErrorAndExit } from "../../../../utils/log.js";
import spawn from "nano-spawn";

const HUSKY_HOOKS_PATH = '.husky';
const REQUIRED_PACKAGES = ['husky'];

// For yarn v1 we were running it on `prepare`, but yarn berry doesn't have support for all the scripts hooks.
// @see https://yarnpkg.com/advanced/lifecycle-scripts
// @see https://docs.npmjs.com/cli/v9/using-npm/scripts#life-cycle-scripts
const LIFECYCLE_SCRIPT_TO_RUN_HUSKY = 'postinstall';

export async function action(commandOptions: z.infer<typeof CommandOptionsSchema>) {
        const options = await parseOptions(commandOptions).catch(logErrorAndExit);

        // Ensure husky is installed
        const dependenciesSpinner = ora({
                text: `Ensure following dependencies are install: ${REQUIRED_PACKAGES.join(",")}`,
                isSilent: options.silent
        }).start();

        const missingPackages = await findMissingDependencies(REQUIRED_PACKAGES);
        if (missingPackages.length === 0) {
                dependenciesSpinner.info("Required dependencies for husky are installed already.");
        } else {
                await yarnCommands.add(missingPackages, "dev");
                dependenciesSpinner.succeed(`The following dependencies added to your pacakage.json: ${missingPackages.join(",")}`)
        }

        // Copy from templates.
        const destination = path.join(ROOT_PATH, HUSKY_HOOKS_PATH);
        const templatesSpinner = ora({
                text: `Installing hooks in ${destination}`,
                isSilent: options.silent
        }).start();
        try {
                copyDir(HUSKY_TEMPLATES_PATH, destination);
                templatesSpinner.succeed(`Husky hooks are moved to your repo successfuly.`)
        } catch (e) {
                templatesSpinner.warn(`It seems husky has been setup already. Installing hooks will be skipped.`)
                console.trace(e)
        }

        // An script should be exist in package.json to install hooks automatically.
        const scriptSpinner = ora({
                text: `Installing hooks in ${destination}`,
                isSilent: options.silent
        }).start();
        const script = "husky";

        const nearestDirectory = await nearestPackageJsonPath();
        if (!nearestDirectory) throw new Error("We couldn't find any package json for your project.");

        const nearestPackageJson = path.join(nearestDirectory, "package.json");
        const packageJson: any = readPackageJson(nearestPackageJson);
        if (!packageJson.scripts?.[LIFECYCLE_SCRIPT_TO_RUN_HUSKY]) {

                if (packageJson.scripts) {
                        packageJson.scripts[LIFECYCLE_SCRIPT_TO_RUN_HUSKY] = script;
                }
                else {
                        packageJson.scripts = {
                                [LIFECYCLE_SCRIPT_TO_RUN_HUSKY]: script
                        }
                }

                scriptSpinner.info(`Adding script to your ${nearestPackageJson}`);
                updatePackageJson(nearestPackageJson, packageJson);
                scriptSpinner.succeed(`An script added to your npm/yarn hooks, named ${LIFECYCLE_SCRIPT_TO_RUN_HUSKY}`);
        }
        else {
                scriptSpinner.info(`We were going to add a '${LIFECYCLE_SCRIPT_TO_RUN_HUSKY}' script to your package json, but an script already exists. make sure '${script}' is included.`);
        }

        // Run `husky install`
        const huskySpinner = ora({
                text: "Try run husky to install the hooks.",
                isSilent: options.silent
        }).start();
        const localHuskyPath = await findBinaryPath("husky");
        await spawn(localHuskyPath);
        huskySpinner.succeed("Husky installed the hooks sucessfuly. we are done.")
}
