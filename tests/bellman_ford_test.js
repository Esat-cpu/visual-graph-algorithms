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


function test_3() {
    const graph = new Graph(true);

    graph.addNode(0, 0);
    graph.addNode(1, 1);
    graph.addNode(2, 2);

    graph.addEdge(0, 1, 1);
    graph.addEdge(1, 2, -3);
    graph.addEdge(2, 0, 0);

    const { negativeCycle } = bellman_ford(graph, 0);

    assert(negativeCycle === true, "Directed negative cycle should be detected");
    console.log("Bellman Ford Directed Negative Cycle Test Succesful!");
}


function test_4() {
    const graph = new Graph(true);

    graph.addNode(0, 0);
    graph.addNode(1, 1);
    graph.addNode(2, 2);

    graph.addEdge(0, 1, -2);
    graph.addEdge(1, 2, 3);

    const { negativeCycle, steps } = bellman_ford(graph, 0);
    const lastDistList = steps[steps.length - 1].distance;

    assert(negativeCycle === false, "No cycle, no false positive");
    assert(lastDistList[1] === -2, "Negative edge respected");
    assert(lastDistList[2] === 1, "Chain through negative edge");
    console.log("Bellman Ford Directed No-Cycle Test Succesful!");
}


function test_5() {
    const graph = new Graph(true);

    graph.addNode(0, 0);
    graph.addNode(1, 1);
    graph.addNode(2, 2);

    graph.addEdge(0, 1, 1);
    graph.addEdge(1, 2, -3);
    graph.addEdge(2, 0, 0);

    const { negativeCycle, cycleEdges, cycleNodes } = bellman_ford(graph, 0);

    assert(negativeCycle === true, "Directed negative cycle should be detected");
    assert(cycleEdges.length === 3, "Cycle should contain 3 edges");
    assert(cycleEdges.every(e => graph.edges.includes(e)), "Cycle edges must reference stored edges");
    assert(cycleNodes.length === 3, "Cycle should contain 3 nodes");
    const total = cycleEdges.reduce((sum, e) => sum + e.weight, 0);
    assert(total < 0, "Cycle total weight must be negative");
    console.log("Bellman Ford Directed Cycle Extraction Test Succesful!");
}


function test_6() {
    const graph = new Graph();

    graph.addNode(0, 0);
    graph.addNode(1, 1);
    graph.addNode(2, 2);

    graph.addEdge(0, 1, 1);
    graph.addEdge(1, 2, -3);

    const { negativeCycle, cycleEdges } = bellman_ford(graph, 0);

    assert(negativeCycle === true, "Undirected negative edge forms a 2-cycle");
    assert(cycleEdges.length === 1, "Undirected 2-cycle should deduplicate its single edge");
    assert(cycleEdges[0].source === 1 && cycleEdges[0].target === 2, "Cycle edge must be the negative one");
    assert(cycleEdges[0].weight < 0, "Cycle total weight must be negative");
    console.log("Bellman Ford Undirected Cycle Extraction Test Succesful!");
}


test_1();
test_2();
test_3();
test_4();
test_5();
test_6();
