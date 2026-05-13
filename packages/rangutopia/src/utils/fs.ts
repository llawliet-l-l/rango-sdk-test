import { findUp, pathExists } from "find-up"
import path from "node:path";
import fs from "node:fs";
import {readFile} from "fs/promises";

export async function findBinaryPath(binary: string): Promise<string | undefined> {
        const localBinPath = (directory: string) => path.join(directory, "node_modules", '.bin', binary);

        const result = await findUp(async (directory) => {
                const hasBinary = await pathExists(localBinPath(directory));
                return hasBinary && directory;
        }, { type: "directory" })

        return result ? localBinPath(result) : undefined;
}



export function copy(src: string, dest: string) {
        const stat = fs.statSync(src)
        if (stat.isDirectory()) {
                copyDir(src, dest)
        } else {
                fs.copyFileSync(src, dest)
        }
}

export function copyDir(srcDir: string, destDir: string) {
        fs.mkdirSync(destDir, { recursive: true })
        for (const file of fs.readdirSync(srcDir)) {
                const srcFile = path.resolve(srcDir, file)
                const destFile = path.resolve(destDir, file)
                copy(srcFile, destFile)
        }
}

export async function importJson<T>(filename: string): Promise<T> {
    const json = JSON.parse(await readFile(filename, 'utf-8')) as T;

    return json;
}
