"use strict";

const { Graph } = require('../js/graph.js');
const { prim } = require('../js/prim.js');
const assert = require('assert');


function test_1() {
    const graph = new Graph();

    graph.addNode(0, 0);
    graph.addNode(1, 1);
    graph.addNode(2, 2);
    graph.addNode(3, 3);

    graph.addEdge(0, 1, 4);
    graph.addEdge(0, 2, 2);
    graph.addEdge(2, 1, 1);
    graph.addEdge(2, 3, 5);
    graph.addEdge(1, 3, 1);

    const { steps, mst } = prim(graph, 0);

    let weight_of_mst = 0;
    mst.forEach(e => weight_of_mst += e.weight);

    assert(weight_of_mst == 4, "Weight of the MST");

    const expected = new Graph();
    expected.addEdge(0, 2, 2);
    expected.addEdge(2, 1, 1);
    expected.addEdge(1, 3, 1);
    expected.edges.sort((a, b) => b.weight - a.weight);

    assert.strictEqual(JSON.stringify(expected.edges), JSON.stringify(mst), "Edges of the MST");

    console.log("Prim Test 1 Succesful!");
}


test_1();
