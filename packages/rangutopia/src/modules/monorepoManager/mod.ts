import fs from "node:fs";
import {TurborepoAdapter} from "./turborepoAdapter.js";
import {NxAdapter} from "./nxAdapter.js";
import {MonorepoManager} from "./monorepoManager.js";

let monorepoManager: MonorepoManager;

export const setupMonorepoManager = () => {
    if (monorepoManager) {
        throw new Error("monorepo manager already setup");
    }

    if (fs.existsSync("turbo.json")) {
        monorepoManager = new MonorepoManager(new TurborepoAdapter());
    }
    else if (fs.existsSync("nx.json")) {
        monorepoManager = new MonorepoManager(new NxAdapter());
    }
}

export const getMonorepoManager = () => {
    if (!monorepoManager) {
        throw new Error("monorepo manager does not exist");
    }
    return monorepoManager;
}

export const removeMonorepoManager = () => {
    monorepoManager = null;
}

export type {MonorepoGraph} from "./types.js";
