"use strict";


class Graph {
    constructor() {
        let nodes = [];
        let edges = [];
        let nodeIdCounter = 0;
    }

    // Add a node with given coordinates
    addNode(x, y) {
        nodes.push({ id: nodeIdCounter++, x:x, y:y });
    }

    // Add an edge between two nodes with a weight
    addEdge(sourceId, targetId, weight) {
        edges.push({ source: sourceId, target: targetId, weight: weight });
    }

    // Check if two nodes are neighbours
    hasEdge (sourceId, targetId) {
        return edges.some(e =>
            (e.source == sourceId && e.target == targetId) ||
            (e.source == targetId) && (e.target == sourceId)
        );
    }

    // Get a node's neighbours
    getNeighbours(nodeId) {
        return edges
            .filter(e => e.source == nodeId || e.target == nodeId)
            .map(e => (nodeId == e.source) ? e.target : e.source);
    }
}
