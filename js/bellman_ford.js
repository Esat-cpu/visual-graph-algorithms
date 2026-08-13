"use strict";


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

    for (let i = 0; i < graph.nodes.length - 1; ++i) {
        let updated = false;

        graph.edges.forEach(e => {
            if (distance[e.target] > distance[e.source] + e.weight) {
                distance[e.target] = distance[e.source] + e.weight;
                parents[e.target] = e.source;
                updated = true;
            }

            if (distance[e.source] > distance[e.target] + e.weight) {
                distance[e.source] = distance[e.target] + e.weight;
                parents[e.source] = e.target;
                updated = true;
            }

            steps.push({ current: e, distance: {...distance} });
        });

        if (!updated) break;
    }

    let negativeCycle = false;
    graph.edges.forEach(e => {
        if (distance[e.target] > distance[e.source] + e.weight ||
            distance[e.source] > distance[e.target] + e.weight) {
            negativeCycle = true;
        }
    });

    return { steps, parents, negativeCycle };
}

if (typeof module !== 'undefined') module.exports = { bellman_ford };

