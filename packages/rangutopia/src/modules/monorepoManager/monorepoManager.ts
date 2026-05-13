import type {MonorepoGraph} from "./types.js";

export interface IMonorepoManagerAdapter {
    graph(): Promise<MonorepoGraph>;
    build(projects: string[]): Promise<void>;
}

export class MonorepoManager implements IMonorepoManagerAdapter{
    #adapter: IMonorepoManagerAdapter;

    constructor(adapter: IMonorepoManagerAdapter) {
        this.#adapter = adapter;
    }

    async graph() {
        return this.#adapter.graph();
    }

    async build(packages: string[]) {
        return this.#adapter.build(packages);
    }
}
