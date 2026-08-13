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

    const steps = dijkstra(graph, 0).steps;
    const lastDistList = steps[steps.length - 1].distance;

    assert(lastDistList[0] === 0, "Start Node");
    assert(lastDistList[1] === 3, "Second");
    assert(lastDistList[2] === 2, "Third");
    assert(lastDistList[3] === 4, "Fourth");
    console.log("Dijkstra Test 1 Succesful!");
}


function test_2() {
    const graph = new Graph(true);

    graph.addNode(0, 0);
    graph.addNode(1, 1);
    graph.addNode(2, 2);
    graph.addNode(3, 3);

    graph.addEdge(0, 1, 1);
    graph.addEdge(1, 0, 10);
    graph.addEdge(1, 2, 2);
    graph.addEdge(2, 3, 1);

    const lastDistList = dijkstra(graph, 0).steps.at(-1).distance;

    assert(lastDistList[0] === 0, "Start Node");
    assert(lastDistList[1] === 1, "Forward edge used");
    assert(lastDistList[2] === 3, "Chain 0->1->2");
    assert(lastDistList[3] === 4, "Chain 0->1->2->3");

    const lastFrom3 = dijkstra(graph, 3).steps.at(-1).distance;
    assert(lastFrom3[0] === Infinity, "Reverse edges must not be used");
    assert(lastFrom3[1] === Infinity, "Reverse edges must not be used");
    console.log("Dijkstra Directed Test Succesful!");
}


test_1();
test_2();

