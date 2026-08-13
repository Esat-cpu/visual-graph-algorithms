"use strict";

// Unit tests for js/prim.js: MST weight, edge selection, step trace shape and
// edge cases (single node, empty, disconnected).

const { Graph } = require('../js/graph.js');
const { prim } = require('../js/prim.js');
const assert = require('assert');


// Build the classic 4-node test graph (same shape in dijkstra/kruskal tests):
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
    const { steps, mst } = prim(graph, 0);

    const weight = mst.reduce((sum, e) => sum + e.weight, 0);
    assert.strictEqual(weight, 4, "MST total weight is 2 + 1 + 1");

    // Compare edge sets regardless of insertion order.
    const got = mst.map(e => [e.source, e.target, e.weight]).sort();
    assert.deepStrictEqual(got, [[0, 2, 2], [1, 3, 1], [2, 1, 1]].sort(), "MST contains the three cheapest spanning edges");

    // Trace: initial step + one step per added edge.
    assert.strictEqual(steps.length, mst.length + 1, "one snapshot per tree edge plus the start");
    assert.strictEqual(steps[0].mst.length, 0, "starts with an empty tree");
    assert.strictEqual(steps.at(-1).mst.length, 3, "final snapshot carries the full MST");
    console.log("Prim Test 1 (MST weight + edges) passed!");
}


function test_visits_all_reachable_nodes() {
    const graph = buildGraph(false);
    const { mst } = prim(graph, 0);
    const seen = new Set();
    mst.forEach(e => { seen.add(e.source); seen.add(e.target); });
    assert.deepStrictEqual([...seen].sort(), [0, 1, 2, 3], "every node appears in the tree");
    console.log("Prim Test 2 (visits all nodes) passed!");
}


function test_single_node_graph() {
    const graph = new Graph(false);
    graph.addNode(0, 0);

    const { steps, mst } = prim(graph, 0);
    assert.deepStrictEqual(mst, [], "no edges to pick");
    assert.strictEqual(steps.length, 1, "only the start snapshot");
    console.log("Prim Test 3 (single node) passed!");
}


function test_disconnected_graph_builds_forest() {
    const graph = new Graph(false);
    [0, 1, 2].forEach(n => graph.addNode(n * 10, n * 10));
    graph.addEdge(0, 1, 1);   // node 2 isolated

    const { mst } = prim(graph, 0);
    assert.strictEqual(mst.length, 1, "only the reachable component is spanned");
    assert.strictEqual(mst[0].source === 0 && mst[0].target === 1, true, "the connecting edge is chosen");
    console.log("Prim Test 4 (disconnected graph) passed!");
}


test_mst_weight_and_edges();
test_visits_all_reachable_nodes();
test_single_node_graph();
test_disconnected_graph_builds_forest();
