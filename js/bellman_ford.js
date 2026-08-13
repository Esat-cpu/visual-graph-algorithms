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
    // relaxable. If one is, a reachable negative cycle exists. This extra pass
    // keeps updating distances/parents so the cycle can be reconstructed from
    // the parent pointers afterwards.
    let negativeCycle = false;
    let cycleNode = null;
    graph.edges.forEach(e => {
        if (distance[e.target] > distance[e.source] + e.weight) {
            distance[e.target] = distance[e.source] + e.weight;
            parents[e.target] = e.source;
            negativeCycle = true;
            cycleNode = e.target;
        }

        if (!graph.directed && distance[e.source] > distance[e.target] + e.weight) {
            distance[e.source] = distance[e.target] + e.weight;
            parents[e.source] = e.target;
            negativeCycle = true;
            cycleNode = e.source;
        }
    });

    const cycle = negativeCycle
        ? extractNegativeCycle(graph, parents, cycleNode)
        : { nodes: [], edges: [] };

    return { steps, parents, negativeCycle, cycleEdges: cycle.edges, cycleNodes: cycle.nodes };
}


// Reconstruct one negative cycle by walking the parent pointers backwards.
// Walking back V times is guaranteed to land on a node inside the cycle;
// from there, following parents circles back to it. The consecutive node
// pairs then map to the stored edge objects, ready for highlighting.
function extractNegativeCycle(graph, parents, start) {
    let node = start;

    // Walk back V times so `node` is guaranteed to sit on the cycle
    for (let i = 0; i < graph.nodes.length; ++i)
        node = parents[node];

    // Walk the cycle until we return to `node`
    const nodes = [node];
    let x = parents[node];
    while (x !== node) {
        nodes.push(x);
        x = parents[x];
    }

    // Map consecutive node pairs to the actual stored edge objects.
    // Following parents walks the cycle backwards (n_{i+1} = parents[n_i]), so
    // the traversed edge is b→a. Directed edges must match that direction;
    // undirected edges are stored in an arbitrary orientation, so either fits.
    // Deduplicate by reference: an undirected 2-cycle visits its single edge
    // once per direction, but consumers want each edge listed only once.
    const seen = new Set();
    const edges = [];
    for (let i = 0; i < nodes.length; ++i) {
        const a = nodes[i];
        const b = nodes[(i + 1) % nodes.length];
        const edge = graph.edges.find(e =>
            (e.source === b && e.target === a) ||
            (!graph.directed && e.source === a && e.target === b)
        );
        if (edge && !seen.has(edge)) {
            seen.add(edge);
            edges.push(edge);
        }
    }

    return { nodes, edges };
}

if (typeof module !== 'undefined') module.exports = { bellman_ford };

