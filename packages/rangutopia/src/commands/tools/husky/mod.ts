import { Command } from "commander";

function huskyCommand(program: Command) {
        const husky = program.command("husky").description("husky to manage git hooks");

        husky.command("init").description("husky for running some scripts on git hooks")
                .option("--silent", "don't print anything to stdout'", false)
                .action(async options => {
                        const { action } = await import("./init/mod.js");
                        action(options);
                });


}


export { huskyCommand }
