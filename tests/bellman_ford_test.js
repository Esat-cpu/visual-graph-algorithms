"use strict";

// Unit tests for js/bellman_ford.js: distances with negative weights, negative
// cycle detection, cycle edge/node extraction, directed and undirected cases.

const { Graph } = require('../js/graph.js');
const { bellman_ford } = require('../js/bellman_ford.js');
const assert = require('assert');


// Build the classic 4-node test graph (same shape in dijkstra/prim/kruskal
// tests): edges 0-1(4), 0-2(2), 2-1(1), 2-3(5), 1-3(1).
function buildGraph(directed) {
    const graph = new Graph(directed);
    [0, 1, 2, 3].forEach(n => graph.addNode(n * 10, n * 10));
    graph.addEdge(0, 1, 4);
    graph.addEdge(0, 2, 2);
    graph.addEdge(2, 1, 1);
    graph.addEdge(2, 3, 5);
    graph.addEdge(1, 3, 1);
    return graph;
}


function test_shortest_paths_with_positive_weights() {
    const graph = buildGraph(false);
    const steps = bellman_ford(graph, 0).steps;
    const last = steps[steps.length - 1].distance;

    assert.strictEqual(last[0], 0, "distance to start is 0");
    assert.strictEqual(last[1], 3, "0->2(2) + 2->1(1) = 3");
    assert.strictEqual(last[2], 2, "0->2 = 2");
    assert.strictEqual(last[3], 4, "0->2->1->3 = 4");
    console.log("Bellman-Ford Test 1 (positive weights) passed!");
}


function test_negative_edge_changes_path() {
    const graph = new Graph(false);
    [0, 1, 2].forEach(n => graph.addNode(n * 10, n * 10));
    graph.addEdge(0, 1, 1);
    graph.addEdge(1, 2, -3);

    const { negativeCycle } = bellman_ford(graph, 0);
    assert.strictEqual(negativeCycle, true, "undirected negative edge forms a 2-cycle");
    console.log("Bellman-Ford Test 2 (negative cycle flagged) passed!");
}


function test_directed_negative_cycle_detected() {
    const graph = new Graph(true);
    [0, 1, 2].forEach(n => graph.addNode(n * 10, n * 10));
    graph.addEdge(0, 1, 1);
    graph.addEdge(1, 2, -3);
    graph.addEdge(2, 0, 0);

    const { negativeCycle } = bellman_ford(graph, 0);
    assert.strictEqual(negativeCycle, true, "directed negative cycle detected");
    console.log("Bellman-Ford Test 3 (directed negative cycle) passed!");
}


function test_directed_no_cycle_keeps_negative_distances() {
    const graph = new Graph(true);
    [0, 1, 2].forEach(n => graph.addNode(n * 10, n * 10));
    graph.addEdge(0, 1, -2);
    graph.addEdge(1, 2, 3);

    const { negativeCycle, steps } = bellman_ford(graph, 0);
    const last = steps[steps.length - 1].distance;

    assert.strictEqual(negativeCycle, false, "no false positive");
    assert.strictEqual(last[1], -2, "negative edge respected");
    assert.strictEqual(last[2], 1, "chain through the negative edge");
    console.log("Bellman-Ford Test 4 (negative weights, no cycle) passed!");
}


function test_directed_cycle_extraction() {
    const graph = new Graph(true);
    [0, 1, 2].forEach(n => graph.addNode(n * 10, n * 10));
    graph.addEdge(0, 1, 1);
    graph.addEdge(1, 2, -3);
    graph.addEdge(2, 0, 0);

    const { negativeCycle, cycleEdges, cycleNodes } = bellman_ford(graph, 0);

    assert.strictEqual(negativeCycle, true, "cycle detected");
    assert.strictEqual(cycleEdges.length, 3, "all three cycle edges extracted");
    assert(cycleEdges.every(e => graph.edges.includes(e)), "cycle edges reference stored edges");
    assert.strictEqual(cycleNodes.length, 3, "all three cycle nodes extracted");
    const total = cycleEdges.reduce((sum, e) => sum + e.weight, 0);
    assert(total < 0, "cycle total weight is negative");
    console.log("Bellman-Ford Test 5 (directed cycle extraction) passed!");
}


function test_undirected_cycle_deduplicates_edges() {
    const graph = new Graph(false);
    [0, 1, 2].forEach(n => graph.addNode(n * 10, n * 10));
    graph.addEdge(0, 1, 1);
    graph.addEdge(1, 2, -3);

    const { negativeCycle, cycleEdges } = bellman_ford(graph, 0);

    assert.strictEqual(negativeCycle, true, "undirected negative edge flagged");
    assert.strictEqual(cycleEdges.length, 1, "undirected 2-cycle deduplicates to one edge");
    assert.strictEqual(cycleEdges[0].source, 1, "cycle edge source");
    assert.strictEqual(cycleEdges[0].target, 2, "cycle edge target");
    assert(cycleEdges[0].weight < 0, "cycle edge is the negative one");
    console.log("Bellman-Ford Test 6 (undirected cycle dedup) passed!");
}


function test_unreachable_nodes_stay_infinite() {
    const graph = new Graph(true);
    [0, 1, 2].forEach(n => graph.addNode(n * 10, n * 10));
    graph.addEdge(0, 1, 2);   // node 2 isolated

    const last = bellman_ford(graph, 0).steps.at(-1).distance;
    assert.strictEqual(last[1], 2, "reachable neighbour relaxed");
    assert.strictEqual(last[2], Infinity, "isolated node stays unreachable");
    console.log("Bellman-Ford Test 7 (unreachable node) passed!");
}


test_shortest_paths_with_positive_weights();
test_negative_edge_changes_path();
test_directed_negative_cycle_detected();
test_directed_no_cycle_keeps_negative_distances();
test_directed_cycle_extraction();
test_undirected_cycle_deduplicates_edges();
test_unreachable_nodes_stay_infinite();
