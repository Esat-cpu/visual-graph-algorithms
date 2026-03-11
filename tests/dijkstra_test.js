"use strict";

const { Graph } = require('../js/graph.js');
const { dijkstra } = require('../js/dijkstra.js');
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

    const steps = dijkstra(graph, 0);
    const lastDistList = steps[steps.length - 1].distance;

    assert(lastDistList[0] === 0, "Start Node");
    assert(lastDistList[1] === 3, "Second");
    assert(lastDistList[2] === 2, "Third");
    assert(lastDistList[3] === 4, "Fourth");
    console.log("Dijkstra Test 1 Succesful!");
}


test_1();

