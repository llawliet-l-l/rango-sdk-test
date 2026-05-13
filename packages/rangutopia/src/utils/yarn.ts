import { stripVTControlCharacters } from "node:util";
import spawn from "nano-spawn";

export const yarnCommands = {
    add(packages: string[], type?: "dev") {
        let args = ["add"]
        if (type === "dev") args.push("-D")
        args = args.concat(packages)
        return spawn("yarn", args)
    },
    async getWorkspaces(json = true) {
        // --json flag guarantees that whether it is run with yarn or node, the output always has a consistent result.
        const result = await spawn("yarn", ['--silent', 'workspaces', 'info', json ? '--json' : ''])
        return { ...result, stdout: stripVTControlCharacters(result.stdout) }
    },
    bumpProductionVersion(packageName: string, releaseType: 'patch' | 'minor' | 'major') {
        return spawn('yarn', [
            '--silent',
            'workspace',
            packageName,
            'version',
            `--${releaseType}`,
            '--no-git-tag-version',
            '--json',
        ])
    },
    bumpPrereleaseVersion(packageName: string) {
        return spawn('yarn', [
            '--silent',
            'workspace',
            packageName,
            'version',
            '--preid=next',
            '--prerelease',
            '--no-git-tag-version',
            '--json',
        ])
    },
    bumpToVersion(packageName: string, newVersion: string) {
        return spawn('yarn', [
            '--silent',
            'workspace',
            packageName,
            'version',
            '--new-version',
            newVersion,
            '--no-git-tag-version',
            '--json',
        ])
    },
    publish(pkgLocation: string, tag: string) {
        return spawn('yarn', [
            'publish',
            pkgLocation,
            '--tag',
            tag,
        ])
    },
};
