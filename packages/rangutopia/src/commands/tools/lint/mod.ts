import { Command } from "commander";

function lintCommand(program: Command) {
        const lint = program.command("lint").description("using lint-related actions");

        lint.command("init").description("init linter for source code and commits")
                .action(async options => {
                        const { action } = await import("./init/mod.js");
                        action(options);
                });
}

export { lintCommand }
