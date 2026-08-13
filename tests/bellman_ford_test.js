"use strict";

const { Graph } = require('../js/graph.js');
const { bellman_ford } = require('../js/bellman_ford.js');
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

    const steps = bellman_ford(graph, 0).steps;
    const lastDistList = steps[steps.length - 1].distance;

    assert(lastDistList[0] === 0, "Start Node");
    assert(lastDistList[1] === 3, "Second");
    assert(lastDistList[2] === 2, "Third");
    assert(lastDistList[3] === 4, "Fourth");
    console.log("Bellman Ford Test 1 Succesful!");
}


function test_2() {
    const graph = new Graph();

    graph.addNode(0, 0);
    graph.addNode(1, 1);
    graph.addNode(2, 2);

    graph.addEdge(0, 1, 1);
    graph.addEdge(1, 2, -3);

    const { negativeCycle } = bellman_ford(graph, 0);

    assert(negativeCycle === true, "Negative cycle should be detected");
    console.log("Bellman Ford Test 2 Succesful!");
}


test_1();
test_2();
