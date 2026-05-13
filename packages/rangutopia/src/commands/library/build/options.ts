import { z } from "zod/v4"
import { validatedSchemaOrThrow } from "../../../utils/parse.js";
import { nodeModulesPolyfillPlugin } from 'esbuild-plugins-node-modules-polyfill';
import { nearestPackageJsonPath, readAndValidatePacakgeJson, readPackageJson } from "../../../utils/packageJson.js";
import type { CommandOptions } from "commander";

import type { BuildOptions as ESBuildOptions } from "esbuild"
import { logErrorAndExit } from "../../../utils/log.js";
import { accessSync, constants } from "node:fs";


const DEFAULT_TSCONFIG_FILENAME = "tsconfig.build.json";
const DEFAULT_OUTPUT_PATH = "dist";
// One of them will be picked, ordering matters.
const DEFAULT_ENTRYPOINTS = [`src/index.ts`, `src/mod.ts`];

export const CommandOptionsSchema = z.object({
        inputs: z.string().optional(),
        external: z.string().optional(),
        externalAllExcept: z.string().optional(),
        splitting: z.boolean().optional(),
});

interface ParsedOptions {
        package: {
                name: string;
                path: string;
        };
        esbuild: ESBuildOptions;
        typescript: {
                declaration: boolean;
                emitDeclarationOnly: boolean;
                project: string;
        };
}

export async function parseOptions(
        commandOptions: z.infer<typeof CommandOptionsSchema>
): Promise<ParsedOptions> {

        const packageJsonRootPath = await nearestPackageJsonPath();
        if (!packageJsonRootPath) {
                throw new Error("We couldn't found any package.json where you are runing the command. Are you in a correct path?'")
        }
        const packageJsonContent = readAndValidatePacakgeJson(packageJsonRootPath);

        const options = validatedSchemaOrThrow(CommandOptionsSchema, commandOptions);
        if (!!options.external && !!options.externalAllExcept) {
                logErrorAndExit("You should only use one of `external` or `external-all-except` at the sametime.")
        }

        const output: ParsedOptions = {
                package: {
                        name: packageJsonContent.name,
                        path: packageJsonRootPath,
                },
                typescript: {
                        declaration: true,
                        emitDeclarationOnly: true,
                        project: DEFAULT_TSCONFIG_FILENAME,
                },
                esbuild: {},
        }


        // esbuild 

        // default options
        output.esbuild = {
                // we should handle errors and printing to terminal ourselves. 
                logLevel: "silent",

                bundle: true,
                minify: true,
                keepNames: true,
                sourcemap: true,
                platform: 'browser',
                format: 'esm',
                metafile: true,
                splitting: !!options.splitting,
                outdir: `${packageJsonRootPath}/${DEFAULT_OUTPUT_PATH}`,


                plugins: [
                        nodeModulesPolyfillPlugin({
                                // TODO: CHECK THIS, THE ORIGINAL SCRIPT WAS `global` instead of `modules`
                                modules: {
                                        fs: true,
                                },
                        }),
                ],
        }


        let entryPoints = [];
        if (!options.inputs) {
                const entryPoint = DEFAULT_ENTRYPOINTS.find(defaultEntryPoint => {
                        try {
                                accessSync(defaultEntryPoint, constants.F_OK);
                                return true;
                        } catch {
                                return false;
                        }
                });

                if (entryPoint) {
                        entryPoints = [`${packageJsonRootPath}/${entryPoint}`];
                }
                else {
                        throw new Error(`We couldn't find any entry point for your code. checked following paths: \n ${DEFAULT_ENTRYPOINTS.join("\n")}`)
                }
        } else {
                entryPoints = options.inputs.split(',').map((input) => `${packageJsonRootPath}/${input}`);
        }
        output.esbuild.entryPoints = entryPoints;


        // read more: https://esbuild.github.io/api/#packages
        if (!!options.external) {
                output.esbuild.external = options.external.split(',');
        } else if (!!options.externalAllExcept) {
                const excludedPackages = options.externalAllExcept.split(',');
                const dependencies = Object.keys(packageJsonContent.dependencies).filter(
                        (name) => !excludedPackages.includes(name)
                );

                output.esbuild.external = dependencies;

        } else {
                output.esbuild.packages = 'external';
        }

        return output
}
