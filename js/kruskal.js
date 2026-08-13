"use strict";


// Kruskal builds a minimum spanning tree by sorting all edges by weight and
// adding each edge only if it does not create a cycle (union-find). Like Prim,
// it assumes an undirected graph, so the caller blocks it in directed mode.
function kruskal(graph) {
    const steps = [];

    const mst = [];
    const parent = {};
    const sortedEdges = [...graph.edges].sort(((a, b) => a.weight - b.weight));

    // Union-find init: every node is its own component
    graph.nodes.forEach(n => parent[n.id] = n.id);


    sortedEdges.forEach(e => {
        // Adding an edge whose endpoints are already in the same component
        // would create a cycle, so skip it
        if (find(e.source, parent) !== find(e.target, parent)) {
            union(e.source, e.target, parent);
            mst.push(e);
        }

        steps.push({ current: e, mst: [...mst] });
    });

    return { steps, mst };
}



// Find the representative of id's component (with path compression)
function find(id, parent) {
    if (parent[id] !== id)
        parent[id] = find(parent[id], parent);
    return parent[id];
}


// Merge two components by linking one representative to the other
function union(id1, id2, parent) {
    parent[find(id1, parent)] = find(id2, parent);
}


if (typeof module !== 'undefined') module.exports = { kruskal };
