"use strict";


// Dijkstra finds the shortest path from startId to every other node.
// It requires non-negative edge weights; for negative weights use Bellman-Ford.
function dijkstra(graph, startId) {
    const steps = [];
    const parents = {};

    const distance = {};
    const visited = {};
    const remaining = new Set(graph.nodes.map(n => n.id));

    // parents[n] records the previous node on the shortest path to n
    graph.nodes.forEach(n => parents[n.id] = null);

    // Start unreachable nodes at infinity so the first update wins
    graph.nodes.forEach(n => distance[n.id] = Infinity);
    distance[startId] = 0;

    steps.push({ current: null, distance: {...distance}, visited: {...visited} });


    while (remaining.size > 0) {
        // Pick the unvisited node with the smallest known distance (greedy step)
        let current = null;

        remaining.forEach(id => {
            if (current === null || distance[id] < distance[current])
                current = id;
        });

        remaining.delete(current);
        visited[current] = true;


        // Relax: if going through `from` gives a shorter path to `to`, update it
        const relax = (from, to, weight) => {
            const newDist = weight + distance[from];

            if (newDist < distance[to]) {
                distance[to] = newDist;
                parents[to] = from;
            }
        };

        // Undirected edges work both ways, so relax both orientations;
        // directed edges are only usable in their stored source→target direction
        graph.edges.forEach(e => {
            relax(e.source, e.target, e.weight);
            if (!graph.directed) relax(e.target, e.source, e.weight);
        });

        steps.push({ current, distance: {...distance}, visited: {...visited} });
    }

    return { steps, parents };
}

if (typeof module !== 'undefined') module.exports = { dijkstra };
