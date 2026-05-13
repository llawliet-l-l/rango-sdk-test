
import { findUp, findUpMultiple } from "find-up";
import { closeSync, openSync, readFileSync, writeSync } from "node:fs";
import path, { dirname, join } from "node:path";
import { z } from "zod/v4";
import { validatedSchemaOrThrow } from "./parse.js";
import {logger} from "../modules/mod.js";
import {ROOT_PATH} from "../constants.js";

export async function nearestPackageJsonPath(): Promise<string | undefined> {
        const firstPackageJson = await findUp("package.json");

        if (!firstPackageJson) {
                return undefined;
        }

        const path = dirname(firstPackageJson);
        return path;
}


export async function lookupPackageJsonFilesToFindDependency(name: string, options?: { checkDevDependency?: boolean }): Promise<string | undefined> {
        const { checkDevDependency = true } = options || {};
        const list = await findUpMultiple("package.json");

        const pathIncludingThePackage: string | undefined = list.find(path => {
                let json: {
                        dependencies?: Record<string, string>;
                        devDependencies?: Record<string, string>;
                };
                try {
                        json = readPackageJson(path);
                } catch (e) {
                        console.log({ e })
                        logger.warn(`Seems ${path} is not a valid json. this file will be skipped.`)
                        // Skiping this iterate
                        return false;
                }

                const isExistInDependencies = json.dependencies?.[name];

                if (checkDevDependency) {
                        const isExistInDevDependencies = json.devDependencies?.[name];
                        return isExistInDependencies || isExistInDevDependencies;
                }

                return isExistInDependencies;
        });

        return pathIncludingThePackage;
}


/**
 * Getting a package json and deserialize it to JS object.
 *
 * @param location it appends `package.json` if not exits in `location` string.
 */
export function readPackageJson(location: string): Record<string, unknown> {

        let fullPath: string;
        if (location.endsWith("package.json")) {
                fullPath = location;
        } else {
                fullPath = join(location, 'package.json');
        }

        let content: string;
        try {
                content = readFileSync(fullPath, {
                        encoding: "utf8"
                });
        } catch (e) {
                throw new Error(`An error occured during reading contents of ${fullPath}.`, { cause: e });
        }

        try {
                return JSON.parse(content);
        } catch (e) {
                throw new Error(`An error occured during paring ${location} file. maybe it's not a valid JSON `, {
                        cause: e
                });
        }
}

export function updatePackageJson(location: string, data: Record<string, unknown>): void {
        let jsonData: string;
        try {
                jsonData = JSON.stringify(data);
        } catch {
                throw new Error("updating package json failed. your data may not be valid.", { cause: data });
        }


        const fd = openSync(location, "w");
        writeSync(fd, jsonData);
        closeSync(fd)
}

export function readAndValidatePacakgeJson(path: string) {
        let packageJsonContent: Record<string, unknown>;
        packageJsonContent = readPackageJson(path);


        // @see https://nodejs.org/api/packages.html#nodejs-packagejson-field-definitions
        // @see https://docs.npmjs.com/cli/v11/configuring-npm/package-json
        const PackageJsonSchema = z.looseObject({
                name: z.string(),
                version: z.string().optional(),
                type: z.literal(["module"]).optional(),
                dependencies: z.record(z.string(), z.string()).optional(),
                devDependencies: z.record(z.string(), z.string()).optional(),
                peerDependencies: z.record(z.string(), z.string()).optional(),
                scripts: z.record(z.string(), z.string()).optional(),
                private: z.boolean().optional()

        });

        const output = validatedSchemaOrThrow(PackageJsonSchema, packageJsonContent);
        return output;
}


export async function findMissingDependencies(requiredDependencies: string[]) {
        const listRequiredPackages = await Promise.all(requiredDependencies.map(name => lookupPackageJsonFilesToFindDependency(name)));

        const missingPackages = [];
        listRequiredPackages.forEach((result, index) => {
                if (!result) {
                        missingPackages.push(requiredDependencies[index])
                }
        });

        return missingPackages;
}



/**
 * Returns the full path of a package including the root path.
 * If no package location is provided, returns the root path.
 *
 * @param {string} [packageLocation=''] - The relative path to the package from root
 * @returns {string} The full path to the package directory
 * @example
 * // Returns root path
 * packagePath()
 *
 */
export function packagePath(packageLocation = '') {
    return path.join(ROOT_PATH, packageLocation);
}

/**
 * Returns the full path to the package.json file of a package.
 * If no package location is provided, returns the root package.json path.
 *
 * // Returns './package.json'
 * packageJsonPath()
 *
 */
export function packageJsonPath(packageLocation = '') {
    return path.join(packagePath(packageLocation), 'package.json');
}
