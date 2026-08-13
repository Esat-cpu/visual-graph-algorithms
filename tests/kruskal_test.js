"use strict";

// Unit tests for js/kruskal.js: MST weight, edge selection, step trace shape
// and edge cases (single node, empty, disconnected, duplicate weights).

const { Graph } = require('../js/graph.js');
const { kruskal } = require('../js/kruskal.js');
const assert = require('assert');


// Build the classic 4-node test graph (same shape in dijkstra/prim tests):
// edges 0-1(4), 0-2(2), 2-1(1), 2-3(5), 1-3(1). Its MST is 0-2(2)+2-1(1)+1-3(1).
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


function test_mst_weight_and_edges() {
    const graph = buildGraph(false);
    const { steps, mst } = kruskal(graph);

    const weight = mst.reduce((sum, e) => sum + e.weight, 0);
    assert.strictEqual(weight, 4, "MST total weight is 2 + 1 + 1");

    // Compare edge sets regardless of insertion order.
    const got = mst.map(e => [e.source, e.target, e.weight]).sort();
    assert.deepStrictEqual(got, [[0, 2, 2], [1, 3, 1], [2, 1, 1]].sort(), "MST contains the three cheapest spanning edges");

    // Trace: one step per edge considered (including rejected ones).
    assert.strictEqual(steps.length, graph.edges.length, "a snapshot per edge examined");
    assert.strictEqual(steps.at(-1).mst.length, 3, "final snapshot carries the full MST");
    console.log("Kruskal Test 1 (MST weight + edges) passed!");
}


function test_cycle_edges_are_rejected() {
    const graph = new Graph(false);
    [0, 1, 2].forEach(n => graph.addNode(n * 10, n * 10));
    graph.addEdge(0, 1, 1);
    graph.addEdge(1, 2, 1);
    graph.addEdge(2, 0, 1);   // adding this last one would form a cycle

    const { mst } = kruskal(graph);
    assert.strictEqual(mst.length, 2, "only n-1 = 2 edges survive");
    assert.strictEqual(mst.reduce((s, e) => s + e.weight, 0), 2, "cycle edge contributes nothing");
    console.log("Kruskal Test 2 (cycle rejection) passed!");
}


function test_single_node_graph() {
    const graph = new Graph(false);
    graph.addNode(0, 0);

    const { steps, mst } = kruskal(graph);
    assert.deepStrictEqual(mst, [], "no edges to pick");
    assert.deepStrictEqual(steps, [], "no edges to examine");
    console.log("Kruskal Test 3 (single node) passed!");
}


function test_empty_graph() {
    const graph = new Graph(false);
    const { steps, mst } = kruskal(graph);
    assert.deepStrictEqual(mst, [], "empty MST");
    assert.deepStrictEqual(steps, [], "no steps");
    console.log("Kruskal Test 4 (empty graph) passed!");
}


function test_disconnected_graph_builds_forest() {
    const graph = new Graph(false);
    [0, 1, 2, 3].forEach(n => graph.addNode(n * 10, n * 10));
    graph.addEdge(0, 1, 1);
    graph.addEdge(2, 3, 2);   // second component

    const { mst } = kruskal(graph);
    assert.strictEqual(mst.length, 2, "each component gets its own tree edges");
    assert.strictEqual(mst.reduce((s, e) => s + e.weight, 0), 3, "sum over both components");
    console.log("Kruskal Test 5 (disconnected graph) passed!");
}


test_mst_weight_and_edges();
test_cycle_edges_are_rejected();
test_single_node_graph();
test_empty_graph();
test_disconnected_graph_builds_forest();
