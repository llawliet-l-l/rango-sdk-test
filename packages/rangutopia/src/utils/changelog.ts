import type {Package} from "../commands/library/publish/types.js";
import { ConventionalChangelog } from 'conventional-changelog';
import path, {join} from "node:path";
import {ROOT_PATH} from "../constants.js";
import {packageJsonPath, packagePath} from "./packageJson.js";
import {createReadStream, createWriteStream, existsSync, mkdirSync} from "node:fs";
import {Writable} from "stream";
import {access, rename, unlink} from "node:fs/promises";
import {pipeline} from "node:stream/promises";
import {logger} from "../modules/mod.js";
import {tmpdir} from "node:os";

export const TAG_PACKAGE_PREFIX = (pkg: {name: string}) =>
    `${packageNameWithoutScope(pkg.name)}@`;

function packageNameWithoutScope(name: string) {
    return name.replace(/@.+\//, '');
}

export async function generateChangelogAndSave(pkg: Package) {
    return new Promise((resolve, reject) => {
        const changelog = memoizeGenerateChangelog(pkg);

        const writeStream = changelog.pipe(changelogFileStream(pkg));

        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
    });
}


export function memoizeGenerateChangelog(pkg: Package) {
    const memoizeFolder = join(tmpdir(), "CHANGELOGS");
    // escaped pkg.name slashes since scoped packages (e.g. @scope/name) contain a slash
    // which would be interpreted as a folder path
    const escapedName = pkg.name.replace(/\//g, '_');
    const changelogMemoizePath = join(memoizeFolder, `${escapedName}@${pkg.version}.tmp`);
    if (existsSync(changelogMemoizePath)) {
        return createReadStream(changelogMemoizePath);
    } else {
        mkdirSync(join(tmpdir(), "CHANGELOGS"), { recursive: true });
        const source = generateChangelog(pkg);
        source.pipe(createWriteStream(changelogMemoizePath));
        return source;
    }
}

function changelogFileStream(pkg) {
    const changelogPath = packageChangelogPath(pkg.location);
    const changelogPathTmp = changelogPath + '.tmp';

    // Creating a temp writer to don't load the whole file in memory at once, at the end will append the old changelog to the temp, then rename it.
    const tempWriteStream = createWriteStream(changelogPathTmp);

    const proxyStream = new Writable({
        write(chunk, encoding, cb) {
            tempWriteStream.write(chunk, encoding, cb);
        },
        final(cb) {
            tempWriteStream.end(async () => {
                try {
                    // if a changelog already exists, we append the old one top the temp.
                    await access(changelogPath)
                        .then(() =>
                            pipeline(
                                createReadStream(changelogPath),
                                createWriteStream(changelogPathTmp, { flags: 'a' })
                            )
                        )
                        .catch(() => {
                            // ignore.
                        });

                    // replace temp as the main changelog.
                    await rename(changelogPathTmp, changelogPath);

                    cb();
                } catch (err) {
                    logger.error(`Failed to prepend changelog: ${{ err }}`);
                    void unlink(changelogPathTmp);

                    cb(err);
                }
            });
        },
    });

    return proxyStream;
}

function packageChangelogPath(packageLocation = '') {
    return path.join(packagePath(packageLocation), 'CHANGELOG.md');
}

export function generateChangelog(pkg: Package) {
    const generator = new ConventionalChangelog(ROOT_PATH);
    generator.loadPreset('angular');

    generator.readPackage(packageJsonPath(pkg.location));
    generator.commits({
        path: pkg.location,
    });

    generator.tags({
        prefix: TAG_PACKAGE_PREFIX(pkg),
    });

    return generator.writeStream();
}
