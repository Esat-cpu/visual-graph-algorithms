"use strict";


// Bellman-Ford finds the shortest path from startId to every other node.
// Unlike Dijkstra it supports negative edge weights, and it also detects
// negative cycles — a cycle whose total weight is negative makes the
// shortest path undefined (distances could be lowered forever).
function bellman_ford(graph, startId) {
    const steps = [];
    const parents = {};

    const distance = {};

    graph.nodes.forEach(n => {
        distance[n.id] = Infinity;
        parents[n.id] = -1;
    });

    distance[startId] = 0;
    parents[startId] = null;

    steps.push({ current: null, distance: {...distance} });

    // Any shortest path uses at most (V - 1) edges, so relaxing every edge
    // V - 1 times is guaranteed to settle all reachable distances
    for (let i = 0; i < graph.nodes.length - 1; ++i) {
        let updated = false;

        graph.edges.forEach(e => {
            // Relax the stored source→target direction
            if (distance[e.target] > distance[e.source] + e.weight) {
                distance[e.target] = distance[e.source] + e.weight;
                parents[e.target] = e.source;
                updated = true;
            }

            // Undirected edges connect both ways, so also relax the reverse
            // direction; directed edges must not be traversed backwards
            if (!graph.directed && distance[e.source] > distance[e.target] + e.weight) {
                distance[e.source] = distance[e.target] + e.weight;
                parents[e.source] = e.target;
                updated = true;
            }

            steps.push({ current: e, distance: {...distance} });
        });

        // If a full pass changes nothing, distances are final — stop early
        if (!updated) break;
    }

    // Negative cycle detection: after V - 1 passes no edge should still be
    // relaxable. If one is, a reachable negative cycle exists.
    let negativeCycle = false;
    graph.edges.forEach(e => {
        if (distance[e.target] > distance[e.source] + e.weight ||
            (!graph.directed && distance[e.source] > distance[e.target] + e.weight)) {
            negativeCycle = true;
        }
    });

    return { steps, parents, negativeCycle };
}

if (typeof module !== 'undefined') module.exports = { bellman_ford };

