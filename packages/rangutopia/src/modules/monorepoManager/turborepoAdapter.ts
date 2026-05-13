import type {IMonorepoManagerAdapter} from "./monorepoManager.js";
import spawn from "nano-spawn";

interface TurborepoLsOutput {
    packages: {
        count: number;
        items: { name: string; path: string }[];
    };
}

interface TurborepoDryRun {
    tasks: {
        taskId: string;
        package: string;
        dependencies: string[];
    }[];
}

const findAndParseJsonFromOutput = (output: string): unknown => {
    const start = output.indexOf('{');
    const end = output.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error(`No JSON found in output:\n${output}`);
    return JSON.parse(output.slice(start, end + 1));
};

export class TurborepoAdapter implements IMonorepoManagerAdapter {
    async graph() {
        const lsResult = await spawn('yarn', ['turbo', 'ls', '--output=json']).catch((error) => {
            throw new Error(`Listing packages failed.\n ${error.stderr}`);
        });

        const turboLs = findAndParseJsonFromOutput(lsResult.stdout) as TurborepoLsOutput;

        const dryResult = await spawn('yarn', ['turbo', 'run', 'build', '--dry=json']).catch((error) => {
            throw new Error(`Creating dry-run failed.\n ${error.stderr}`);
        });

        const turboDry = findAndParseJsonFromOutput(dryResult.stdout) as TurborepoDryRun;

        return {
            nodes: turboLs.packages.items.map(pkg => pkg.name),
            dependencies: new Map(
                turboDry.tasks.map(task => [
                    task.package,
                    task.dependencies.map(dep => dep.split('#')[0])
                ])
            ),
        };
    }

    async build(projects: string[]): Promise<void> {
        await spawn('yarn', ['turbo', 'run', 'build',
            ...projects.map(p => `--filter=${p}`),
        ]);
    }
}
