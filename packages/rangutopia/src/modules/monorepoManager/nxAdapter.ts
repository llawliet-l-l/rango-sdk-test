import type {IMonorepoManagerAdapter} from "./monorepoManager.js";
import {join} from "path";
import {ROOT_PATH} from "../../constants.js";
import spawn from "nano-spawn";
import {importJson} from "../../utils/fs.js";
import {rmSync} from "node:fs";

interface NxGraph {
    graph: {
        nodes: Record<string, object>;
        dependencies: Record<string, { source: string, target: string, type: string }[]>;
    }
}

export class NxAdapter implements IMonorepoManagerAdapter {
    async graph() {
        const filename = '__output__.json';
        const filepath = join(ROOT_PATH, filename);

        await spawn('yarn', ['nx', 'graph', '--file', filename]).catch(async (error) => {
            throw new Error(`Creating graph file failed. \n ${error.stderr}`);
        });

        const nxGraph = await importJson<NxGraph>(filepath);

        rmSync(filename, { force: true });

        return {
            nodes: Object.keys(nxGraph.graph.nodes),
            dependencies: new Map(
                Object.keys(nxGraph.graph.dependencies).map(
                    dep => ([dep, nxGraph.graph.dependencies[dep].map(depNode => depNode.target)])
                )
            ),
        };
    }

    async build(projects: string[]): Promise<void> {
        await spawn("yarn", ["nx",
            "run-many", "--target=build",
            `--projects=${projects.join(",")}`,
        ]);
    }
}
