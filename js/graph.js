"use strict";


class Graph {
    constructor() {
        this.nodes = [];
        this.edges = [];
        this.nodeIdCounter = 0;
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

    // Get a node's neighbours ID list
    getNeighbours(nodeId) {
        return nodes
            .filter(n => this.hasEdge(nodeId, n.id))
            .map(n => n.id);
    }

    // Get the edge between two nodes
    edgeBetween(nodeId1, nodeId2) {
        return edges.find(e =>
            (e.source == nodeId1 && e.target == nodeId2) ||
            (e.source == nodeId2 && e.target == nodeId1)
        );
    }
}
