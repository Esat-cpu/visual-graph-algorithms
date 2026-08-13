"use strict";

// Unit tests for js/dijkstra.js: shortest-path distances, parent chains and
// step traces, including directed graphs and edge cases.

const { Graph } = require('../js/graph.js');
const { dijkstra } = require('../js/dijkstra.js');
const assert = require('assert');


// Build the classic 4-node test graph (same shape in prim/kruskal tests):
// edges 0-1(4), 0-2(2), 2-1(1), 2-3(5), 1-3(1).
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


// Walk the parents chain backwards from a node; returns the reversed path.
function reconstructPath(parents, target) {
    const path = [];
    let cur = target;
    while (cur != null && !path.includes(cur)) {
        path.push(cur);
        cur = parents[cur];
    }
    return path.reverse();
}


function test_shortest_paths_on_small_undirected_graph() {
    const graph = buildGraph(false);
    const { steps, parents } = dijkstra(graph, 0);

    const last = steps[steps.length - 1].distance;
    assert.strictEqual(last[0], 0, "distance to start is 0");
    assert.strictEqual(last[1], 3, "0->2(2) + 2->1(1) = 3 beats 0->1(4)");
    assert.strictEqual(last[2], 2, "0->2 = 2");
    assert.strictEqual(last[3], 4, "0->2->1->3 = 4 beats 0->2->3 = 7");

    // Parent chain reconstructs the same paths.
    assert.deepStrictEqual(reconstructPath(parents, 3), [0, 2, 1, 3], "parents chain to node 3");
    assert.deepStrictEqual(reconstructPath(parents, 1), [0, 2, 1], "parents chain to node 1");

    // The trace is a valid animation: first step before any visit, monotone
    // step count, and the last step carries the final distances.
    assert.strictEqual(steps[0].current, null, "first step is the initial state");
    assert.strictEqual(steps[steps.length - 1].visited[3], true, "final step has visited everything reachable");
    assert(steps.length >= 4, "one step per settled node plus the initial snapshot");
    console.log("Dijkstra Test 1 (shortest paths) passed!");
}


function test_directed_edges_only_usable_one_way() {
    const graph = new Graph(true);
    [0, 1, 2, 3].forEach(n => graph.addNode(n * 10, n * 10));
    graph.addEdge(0, 1, 1);
    graph.addEdge(1, 0, 10);   // reverse direction exists but is expensive
    graph.addEdge(1, 2, 2);
    graph.addEdge(2, 3, 1);

    const from0 = dijkstra(graph, 0).steps.at(-1).distance;
    assert.strictEqual(from0[1], 1, "forward edge used");
    assert.strictEqual(from0[2], 3, "chain 0->1->2");
    assert.strictEqual(from0[3], 4, "chain 0->1->2->3");

    const from3 = dijkstra(graph, 3).steps.at(-1).distance;
    assert.strictEqual(from3[0], Infinity, "reverse edges must not be traversed");
    assert.strictEqual(from3[1], Infinity, "no path against the edge direction");
    console.log("Dijkstra Test 2 (directed) passed!");
}


function test_unreachable_nodes_stay_infinite() {
    const graph = new Graph(false);
    [0, 1, 2].forEach(n => graph.addNode(n * 10, n * 10));
    graph.addEdge(0, 1, 1);   // node 2 is isolated

    const last = dijkstra(graph, 0).steps.at(-1).distance;
    assert.strictEqual(last[1], 1, "reachable neighbour relaxed");
    assert.strictEqual(last[2], Infinity, "isolated node stays unreachable");
    console.log("Dijkstra Test 3 (unreachable node) passed!");
}


function test_single_node_graph() {
    const graph = new Graph(false);
    graph.addNode(0, 0);

    const { steps, parents } = dijkstra(graph, 0);
    assert.strictEqual(steps.at(-1).distance[0], 0, "start distance is 0");
    assert.strictEqual(steps.length, 2, "initial snapshot + settling the start node");
    assert.deepStrictEqual(parents, { 0: null }, "start has no parent");
    console.log("Dijkstra Test 4 (single node) passed!");
}


function test_empty_graph_does_not_crash() {
    const graph = new Graph(false);
    const { steps, parents } = dijkstra(graph, 0);
    assert.strictEqual(steps.length, 1, "only the initial snapshot");
    assert.strictEqual(steps[0].current, null, "nothing to settle");
    assert.strictEqual(steps[0].distance[0], 0, "start distance is seeded even with no nodes");
    assert.deepStrictEqual(parents, {}, "no parents for an empty graph");
    console.log("Dijkstra Test 5 (empty graph) passed!");
}


test_shortest_paths_on_small_undirected_graph();
test_directed_edges_only_usable_one_way();
test_unreachable_nodes_stay_infinite();
test_single_node_graph();
test_empty_graph_does_not_crash();
