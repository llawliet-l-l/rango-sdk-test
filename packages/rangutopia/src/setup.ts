import type {Command} from "commander";
import {setupLogger, setupMonorepoManager} from "./modules/mod.js";

export const setup = (program: Command) => {
    setupGeneralInfoAndOptions(program)

    program.hook("preAction", (thisCommand) => {
        const options = thisCommand.opts();
        setupLogger({ verbose: options.verbose ?? false });
        setupMonorepoManager()
    });
}

const setupGeneralInfoAndOptions = (program: Command) => {
    program
        .name("Rangutopia")
        .description("Scripts across rango organization.")
        .option("-v, --verbose", "Verbose", false);
}
