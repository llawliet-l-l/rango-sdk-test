
import { logErrorAndExit } from "../../../utils/log.js";
import ora from "ora";
import { lookupPackageJsonFilesToFindDependency } from "../../../utils/packageJson.js";

const REQUIRED_DEV_DEPENDENCIES = ["typescript", "esbuild"];

// TODO: Suggest yarn add pkg-name
export async function action(_options: unknown) {

        // Check building tools
        const spinner = ora("Checking required dependencies...").start();
        const listRequiredPackages = await Promise.all(REQUIRED_DEV_DEPENDENCIES.map(name => lookupPackageJsonFilesToFindDependency(name)));


        const missingPackages = [];
        listRequiredPackages.forEach((result, index) => {
                if (!result) {
                        missingPackages.push(REQUIRED_DEV_DEPENDENCIES[index])
                }
        });


        if (missingPackages.length > 0) {
                spinner.fail(`You can install missing dependencies using \n \`yarn add -D ${missingPackages.join(" ")}\``);
                logErrorAndExit(`Ensure you've installed the following dev dependencies: ${missingPackages.join(",")}`)
        } else {

                spinner.succeed("Dependencies checked.");
        }

}
