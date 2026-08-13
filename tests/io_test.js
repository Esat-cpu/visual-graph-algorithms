"use strict";

// Tests for the graph file I/O module (js/io.js): serialization round-trips
// and validation of malformed payloads.

const { Graph } = require('../js/graph.js');
const { graphToJSON, validateGraphData, exportFilename } = require('../js/io.js');
const assert = require('assert');


function test_serialize_undirected_roundtrip() {
    const g = new Graph(false);
    g.addNode(10, 20);   // id 0
    g.addNode(30, 40);   // id 1
    g.addEdge(0, 1, 5);

    const json = graphToJSON(g);
    assert.strictEqual(json.format, "vga", "format marker present");
    assert.strictEqual(json.version, 1, "format version present");
    assert.strictEqual(json.directed, false, "undirected flag preserved");
    assert.strictEqual(json.nodeIdCounter, 2, "node id counter preserved");
    assert.deepStrictEqual(json.nodes, [{ id: 0, x: 10, y: 20 }, { id: 1, x: 30, y: 40 }], "nodes serialized");
    assert.deepStrictEqual(json.edges, [{ source: 0, target: 1, weight: 5 }], "edges serialized");

    // And the payload survives a JSON round-trip unchanged.
    assert.deepStrictEqual(JSON.parse(JSON.stringify(json)), json, "JSON-safe structure");
    console.log("IO Test 1 (undirected serialize) Succesful!");
}


function test_serialize_directed_roundtrip() {
    const g = new Graph(true);
    g.addNode(0, 0);
    g.addNode(100, 100);
    g.addEdge(0, 1, -3);

    const json = graphToJSON(g);
    assert.strictEqual(json.directed, true, "directed flag preserved");
    assert.deepStrictEqual(json.edges, [{ source: 0, target: 1, weight: -3 }], "negative weight kept");
    console.log("IO Test 2 (directed serialize) Succesful!");
}


function test_validate_accepts_valid_data() {
    const problems = validateGraphData({
        format: "vga",
        version: 1,
        directed: true,
        nodeIdCounter: 3,
        nodes: [{ id: 0, x: 1, y: 2 }, { id: 2, x: 3, y: 4 }],
        edges: [{ source: 0, target: 2, weight: 7 }]
    });
    assert.deepStrictEqual(problems, [], "valid payload has no problems");
    console.log("IO Test 3 (validate accepts) Succesful!");
}


function test_validate_rejects_garbage() {
    assert(validateGraphData(null).length > 0, "null rejected");
    assert(validateGraphData({}).length > 0, "empty object rejected");
    assert(validateGraphData({ format: "vga", version: 99, directed: false, nodes: [], edges: [] }).length > 0, "bad version rejected");
    assert(validateGraphData({ format: "nope", version: 1, directed: false, nodes: [], edges: [] }).length > 0, "bad format rejected");
    console.log("IO Test 4 (validate rejects garbage) Succesful!");
}


function test_validate_rejects_malformed_members() {
    const problems = validateGraphData({
        format: "vga",
        version: 1,
        directed: false,
        nodeIdCounter: 1,
        nodes: [{ id: "x", x: 0, y: 0 }, { id: 1 }],
        edges: [{ source: 0 }, { source: 0, target: 1, weight: "five" }]
    });
    assert(problems.length >= 4, `malformed members flagged (got ${problems.length})`);
    console.log("IO Test 5 (validate rejects malformed members) Succesful!");
}


function test_export_filename() {
    assert.strictEqual(exportFilename(new Graph(false)), "graph-undirected.json", "undirected name");
    assert.strictEqual(exportFilename(new Graph(true)), "graph-directed.json", "directed name");
    console.log("IO Test 6 (export filename) Succesful!");
}


test_serialize_undirected_roundtrip();
test_serialize_directed_roundtrip();
test_validate_accepts_valid_data();
test_validate_rejects_garbage();
test_validate_rejects_malformed_members();
test_export_filename();
