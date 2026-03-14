"use strict";


class Graph {
    constructor() {
        this.nodes = [];
        this.edges = [];
        this.nodeIdCounter = 0;
    }

    // Add a node with given coordinates
    addNode(x, y) {
        this.nodes.push({ id: this.nodeIdCounter++, x:x, y:y });
    }

    // Add an edge between two nodes with a weight
    addEdge(sourceId, targetId, weight) {
        this.edges.push({ source: sourceId, target: targetId, weight: weight });
    }

    // Check if two nodes are neighbours
    hasEdge (sourceId, targetId) {
        return this.edges.some(e =>
            (e.source == sourceId && e.target == targetId) ||
            (e.source == targetId) && (e.target == sourceId)
        );
    }

    // Get a node's neighbours ID list
    getNeighbours(nodeId) {
        return this.nodes
            .filter(n => this.hasEdge(nodeId, n.id))
            .map(n => n.id);
    }

    // Get the edge between two nodes
    edgeBetween(nodeId1, nodeId2) {
        return this.edges.find(e =>
            (e.source == nodeId1 && e.target == nodeId2) ||
            (e.source == nodeId2 && e.target == nodeId1)
        );
    }

    // Get the edges connected to a node
    getEdges(nodeId) {
        return this.edges.filter(e =>
            (e.source == nodeId || e.target == nodeId)
        );
    }

    // Get node by ID
    getNode(id) {
        this.nodes.find(n => (n.id === id));
    }
}

if (typeof module !== 'undefined') module.exports = { Graph };
