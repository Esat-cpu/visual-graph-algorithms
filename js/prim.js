"use strict";


function prim(graph, startId) {
    const steps = [];

    const visited = new Set();
    visited.add(startId);

    const mst = [];

    let current = startId;
    steps.push({ current, mst: [...mst] });

    while (visited.size < graph.nodes.length) {
        const edges = graph.edges
            .filter(e => (visited.has(e.source) ^ visited.has(e.target)));
        const min_w_edge = find_min(edges);

        current = visited.has(min_w_edge.source) ? min_w_edge.target : min_w_edge.source;
        visited.add(current);

        mst.push(min_w_edge);
        steps.push({ current, mst: [...mst] });
    }

    return { steps, mst };
}


function find_min(list_of_edges) {
    if (list_of_edges.length === 0) return null;

    let min = list_of_edges[0];
    for (let element of list_of_edges) {
        if (min.weight > element.weight) min = element;
    }

    return min;
}


module.exports = { prim };
