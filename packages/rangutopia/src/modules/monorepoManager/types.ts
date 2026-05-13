export interface MonorepoGraph {
    nodes: string[];
    dependencies: Map<string, string[]>;
}

