"use strict";


// Graph holds the nodes and edges of the active workspace.
// Each workspace (undirected / directed) gets its own instance so switching
// between modes never converts or loses edge data.
class Graph {
    // `directed` controls how edges are interpreted: when true, an edge only
    // exists in its stored source→target direction.
    constructor(directed = false) {
        this.nodes = [];
        this.edges = [];
        this.nodeIdCounter = 0;
        this.directed = directed;
    }

    // Add a node with given coordinates
    addNode(x, y) {
        this.nodes.push({ id: this.nodeIdCounter++, x:x, y:y });
    }

    // Add an edge between two nodes with a weight
    addEdge(sourceId, targetId, weight) {
        this.edges.push({ source: sourceId, target: targetId, weight: weight });
    }

    // Check if an edge exists between two nodes.
    // In directed mode only source→target counts; in undirected mode an edge
    // stored in either orientation connects the two nodes.
    hasEdge(sourceId, targetId) {
        if (this.directed)
            return this.edges.some(e => e.source === sourceId && e.target === targetId);
        return this.edges.some(e =>
            (e.source === sourceId && e.target === targetId) ||
            (e.source === targetId && e.target === sourceId)
        );
    }

    // Get a node's neighbours ID list.
    // In directed mode this naturally returns only outgoing neighbours
    // because hasEdge only matches the source→target direction.
    getNeighbours(nodeId) {
        return this.nodes
            .filter(n => this.hasEdge(nodeId, n.id))
            .map(n => n.id);
    }

    // Get node by ID
    getNode(id) {
        return this.nodes.find(n => (n.id === id));
    }
}

if (typeof module !== 'undefined') module.exports = { Graph };
