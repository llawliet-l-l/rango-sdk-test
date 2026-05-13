import { Command } from "commander";
import { huskyCommand } from "./husky/mod.js";
import { lintCommand } from "./lint/mod.js";

function toolsCommand(program: Command) {
        const tools = program.command("tools").description("third party tools we are using");
        huskyCommand(tools)
        lintCommand(tools)
}


export { toolsCommand }
