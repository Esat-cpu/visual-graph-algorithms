"use strict";


// Prim grows a minimum spanning tree from a start node by repeatedly adding
// the cheapest edge that connects the visited set to an unvisited node.
// It only makes sense on an undirected graph (MST is undefined for directed
// graphs), so the caller blocks it in directed mode.
function prim(graph, startId) {
    const steps = [];

    const visited = new Set();
    visited.add(startId);

    const mst = [];

    let current = startId;
    steps.push({ current, mst: [...mst] });

    while (visited.size < graph.nodes.length) {
        // Candidate edges: exactly one endpoint already in the tree (XOR)
        const edges = graph.edges
            .filter(e => (visited.has(e.source) ^ visited.has(e.target)));
        const min_w_edge = find_min(edges);
        if (!min_w_edge) break;

        // Move the edge's unvisited endpoint into the tree
        current = visited.has(min_w_edge.source) ? min_w_edge.target : min_w_edge.source;
        visited.add(current);

        mst.push(min_w_edge);
        steps.push({ current, mst: [...mst] });
    }

    return { steps, mst };
}


// Return the edge with the smallest weight, or null when the list is empty
function find_min(list_of_edges) {
    if (list_of_edges.length === 0) return null;

    let min = list_of_edges[0];
    for (let element of list_of_edges) {
        if (min.weight > element.weight) min = element;
    }

    return min;
}


if (typeof module !== 'undefined') module.exports = { prim };
