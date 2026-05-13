export type Channels = "prod" | "next" | "experimental"

export type YarnWorkspaceInfo = Record<string,
    {
        location: string;
        workspaceDependencies: string[];
        mismatchedWorkspaceDependencies: string[];
    }
>

export interface Package {
    name: string
    location: string
    version: string
    private: boolean
}

export interface PackageState {
    version: string,
    gitTag: string,
    githubRelease: string,
    npmVersion: string
}

export interface IncreaseVersionResult {
    current: string;
    next: string;
}

export interface NpmPackageVersions {
    next: string | null;
    prod: string | null;
}
