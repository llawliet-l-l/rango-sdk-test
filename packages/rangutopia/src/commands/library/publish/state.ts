import type {Package, PackageState} from "./types.js";

export class State {
    pkgs: Package[] = [];
    state: Record<string, Partial<PackageState>> = {};

    constructor(pkgs: Package[]) {
        this.pkgs = pkgs;
    }

    toJSON() {
        const output = {
            pkgs: this.pkgs,
            state: this.state,
        };

        return JSON.stringify(output);
    }

    /**
     *
     * Get packages in state **with latest version**.
     *
     */
    list() {
        return this.pkgs.map((pkg) => {
            return {
                ...pkg,
                version: this.getState(pkg.name, 'version'),
            };
        });
    }

    getState(pkgName: string): Partial<PackageState> | undefined;
    getState(pkgName: string, name: keyof PackageState): string | undefined
    getState(pkgName: string, name?: keyof PackageState) {
        if (!this.state[pkgName]) {
            return undefined;
        }

        // Return whole state
        if (!name) {
            return this.state[pkgName];
        }

        return this.state[pkgName][name];
    }

    setState(pkgName: string, name: keyof PackageState, value: string) {
        if (!this.state[pkgName]) {
            this.state[pkgName] = {};
        }

        this.state[pkgName][name] = value;
    }
}
