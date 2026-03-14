"use strict";


function dijkstra(graph, startId) {
    const steps = [];
    const parents = {};

    const distance = {};
    const visited = {};
    const remaining = new Set(graph.nodes.map(n => n.id));

    graph.nodes.forEach(n => parents[n.id] = null);

    graph.nodes.forEach(n => distance[n.id] = Infinity);
    distance[startId] = 0;

    steps.push({ current: null, distance: {...distance}, visited: {...visited} });


    while (remaining.size > 0) {
        let current = null;

        remaining.forEach(id => {
            if (current === null || distance[id] < distance[current])
                current = id;
        });

        remaining.delete(current);
        visited[current] = true;


        const neighbours = graph.getNeighbours(current);

        neighbours.forEach(neighbourId => {
            const edge = graph.edgeBetween(neighbourId, current);
            const newDist = edge.weight + distance[current];

            if (newDist < distance[neighbourId]) {
                distance[neighbourId] = newDist;
                parents[neighbourId] = current;
            }
        });

        steps.push({ current, distance: {...distance}, visited: {...visited} });
    }

    return { steps, parents };
}

if (typeof module !== 'undefined') module.exports = { dijkstra };
