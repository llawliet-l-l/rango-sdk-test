import { Command } from "commander";


function libraryCommand(program: Command) {
        const library = program.command("library").description("Actions you need for your library packages");

        library.command("init").description("init whatever").action(async _options => {
                throw new Error("not implemented")
        });
        library.command("check").description("ensure on target package, everything has setup").action(async (options) => {
                const { action } = await import("./check/mod.js");
                action(options);
        });
        library.command("build").description("build your library")
                .option("--inputs <inputs>", "comma separated file paths. e.g. src/main.ts,src/net.ts")
                .option("--external <external>", "Comma separated list. https://esbuild.github.io/api/#external")
                .option("--external-all-except <exception-list>", "When you want to make all the packages external, and only include some specific packages as your library bundle, this will be useful. Comma separated.")
                .option("--splitting", "Enable code splitting", false)
                .action(async (options) => {
                        const { action } = await import("./build/mod.js");
                        action(options);
                });
    library
        .command("publish")
        .description(
            "Update your public packages' versions and changelogs, publish them on NPM, commit changes, and tag the commit",
        )
        .option(
            "--prod",
            "Enables production flow, compares changes in the current branch with the last tagged commit",
            false,
        )
        .option(
            "--next",
            "Enables next flow, uses regex pattern to match the last published commit title; changes since that commit will be considered for publishing",
            false
        )
        .option(
            "--experimental",
            "Enables experimental flow, compares changes since the current branch diverged from the main branch",
            false,
        )
        .option(
            "--since-start",
            "consider all packages in the current branch for publishing",
            false,
        )
        .action(async (options) => {
            const { action } = await import("./publish/mod.js");
            action(options);
        });
}


export { libraryCommand }
