import { detectEdges } from './helpers.js';

export const ROOT_KEY = '__ROOT__';

export class Graph {
    nodes: Map<string, string[]>

    constructor() {
        this.nodes = new Map();
        this.addNode(ROOT_KEY);
    }

    addNode(node) {
        this.nodes.set(node, []);
    }

    addEdge(source, destination) {
        this.nodes.get(source).push(destination);
    }

    onlyAffected(list: string[]) {
        const finalNodes = new Set();
        const edges = detectEdges(this.nodes);

        list.forEach((affectedNode) => {
            finalNodes.add(affectedNode);
            bubbleUp(finalNodes, edges, affectedNode);
        });

        const nextNodes = new Map();
        this.nodes.forEach((edges, node) => {
            if (finalNodes.has(node)) {
                nextNodes.set(
                    node,
                    edges.filter((dependentOnNode) => {
                        return finalNodes.has(dependentOnNode);
                    }),
                );
            }
        });

        this.nodes = nextNodes;
    }

    sort() {
        const sortedList = new Set<string>();

        const tempGraph = structuredClone(this.nodes);
        while (tempGraph.size > 1) {
            this.kindaDFS(ROOT_KEY, sortedList, tempGraph);
        }

        return sortedList;
    }

    kindaDFS(startNode: string, sortedList: Set<string>, graph: Map<string, string[]>) {
        const visitedNodes = new Map<string, {outdeg: number}>();
        this.dfs(startNode, visitedNodes, graph);

        visitedNodes.forEach((value, node) => {
            if (value.outdeg === 0) {
                sortedList.add(node);
                graph.delete(node);
                removeEdgeTo(node, graph);
            }
        });
    }

    dfs(node: string, visitedNodes: Map<string, {outdeg: number}>, graph: Map<string, string[]>) {
        const neighbors = graph.get(node);
        visitedNodes.set(node, {
            outdeg: neighbors.length,
        });
        for (const neighbor of neighbors) {
            if (!visitedNodes.has(neighbor)) {
                this.dfs(neighbor, visitedNodes, graph);
            }
        }
    }

    toString() {
        let output = '';
        for (const [node, neighbors] of this.nodes) {
            let neighborsStr = neighbors.length > 0 ? neighbors.join(', ') : 'None';
            output += `${node} -> ${neighborsStr}\n`;
        }

        return output;
    }
}

function removeEdgeTo(targetNode: string, graph: Map<string, string[]>) {
    for (const node of graph.keys()) {
        graph.set(
            node,
            graph.get(node).filter((edge) => edge !== targetNode)
        );
    }
}

function bubbleUp(result, nodesWithEdges, targetNode) {
    nodesWithEdges.get(targetNode).indeg.forEach((parentNode) => {
        result.add(parentNode);
        bubbleUp(result, nodesWithEdges, parentNode);
    });
}
