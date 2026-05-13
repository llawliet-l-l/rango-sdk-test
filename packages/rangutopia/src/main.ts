#!/usr/bin/env node

import { Command } from "commander";
import { libraryCommand } from "./commands/library/mod.js";
import { toolsCommand } from "./commands/tools/mod.js";
import {setup} from "./setup.js";


const program = new Command();

setup(program)

// Attach sub-commands
libraryCommand(program)
toolsCommand(program)


program.parse(process.argv)
