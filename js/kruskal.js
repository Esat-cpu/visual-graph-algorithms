"use strict";


function kruskal(graph) {
    const steps = [];

    const mst = [];
    const parent = {};
    const sortedEdges = [...graph.edges].sort(((a, b) => a.weight - b.weight));

    graph.nodes.forEach(n => parent[n.id] = n.id);


    sortedEdges.forEach(e => {
        if (find(e.source, parent) !== find(e.target, parent)) {
            union(e.source, e.target, parent);
            mst.push(e);
        }

        steps.push({ current: e, mst: [...mst] });
    });

    return { steps, mst };
}



function find(id, parent) {
    if (parent[id] !== id)
        parent[id] = find(parent[id], parent);
    return parent[id];
}


function union(id1, id2, parent) {
    parent[find(id1, parent)] = find(id2, parent);
}


if (typeof module !== 'undefined') module.exports = { kruskal };
