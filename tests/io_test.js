"use strict";

// Tests for the graph file I/O module (js/io.js): serialization, validation
// and the export filename helper.

const { Graph } = require('../js/graph.js');
const { graphToJSON, validateGraphData, exportFilename, parseGraphFile, importPlan } = require('../js/io.js');
const assert = require('assert');


function test_serialize_undirected_roundtrip() {
    const g = new Graph(false);
    g.addNode(10, 20);   // id 0
    g.addNode(30, 40);   // id 1
    g.addEdge(0, 1, 5);

    const json = graphToJSON(g);
    assert.strictEqual(json.format, "vga", "format marker present");
    assert.strictEqual(json.version, 1, "version present");
    assert.strictEqual(json.directed, false, "undirected flag preserved");
    assert.strictEqual(json.nodeIdCounter, 2, "node id counter preserved");
    assert.deepStrictEqual(json.nodes, [{ id: 0, x: 10, y: 20 }, { id: 1, x: 30, y: 40 }], "nodes serialized");
    assert.deepStrictEqual(json.edges, [{ source: 0, target: 1, weight: 5 }], "edges serialized");

    // And a JSON round-trip preserves it all.
    assert.deepStrictEqual(JSON.parse(JSON.stringify(json)), json, "JSON-safe structure");
    console.log("IO Test 1 (serialize undirected) Succesful!");
}


function test_serialize_directed() {
    const g = new Graph(true);
    g.addNode(1, 1);
    g.addNode(2, 2);
    g.addEdge(0, 1, -7);   // negative weights must survive

    const json = graphToJSON(g);
    assert.strictEqual(json.directed, true, "directed flag preserved");
    assert.deepStrictEqual(json.edges, [{ source: 0, target: 1, weight: -7 }], "negative weight kept");
    assert.strictEqual(json.nodeIdCounter, 2, "counter preserved");
    console.log("IO Test 2 (serialize directed) Succesful!");
}


function test_validate_accepts_valid_data() {
    const problems = validateGraphData({
        format: "vga", version: 1, directed: false, nodeIdCounter: 2,
        nodes: [{ id: 0, x: 0, y: 0 }, { id: 1, x: 5, y: 5 }],
        edges: [{ source: 0, target: 1, weight: 3 }]
    });
    assert.deepStrictEqual(problems, [], "valid payload has no problems");
    console.log("IO Test 3 (validate accepts) Succesful!");
}


function test_validate_rejects_bad_shapes() {
    assert(validateGraphData(null).length > 0, "null rejected");
    assert(validateGraphData("hello").length > 0, "string rejected");
    assert(validateGraphData({}).length > 0, "empty object rejected");
    assert(validateGraphData({ format: "vga", version: 2, directed: false, nodes: [], edges: [] }).length > 0, "bad version rejected");
    assert(validateGraphData({ format: "other", version: 1, directed: false, nodes: [], edges: [] }).length > 0, "bad format rejected");
    assert(validateGraphData({ format: "vga", version: 1, directed: "yes", nodes: [], edges: [] }).length > 0, "non-boolean directed rejected");
    console.log("IO Test 4 (validate rejects bad shapes) Succesful!");
}


function test_validate_rejects_malformed_members() {
    const problems = validateGraphData({
        format: "vga", version: 1, directed: false, nodeIdCounter: 2,
        nodes: [{ id: "x", x: 0, y: 0 }, { id: 1 }],
        edges: [{ source: 0, target: "y", weight: 2 }]
    });
    assert(problems.length >= 3, "malformed nodes and edges flagged");
    console.log("IO Test 5 (validate rejects malformed members) Succesful!");
}


function test_export_filename() {
    assert.strictEqual(exportFilename(new Graph(false)), "graph-undirected.json", "undirected name");
    assert.strictEqual(exportFilename(new Graph(true)), "graph-directed.json", "directed name");
    console.log("IO Test 6 (export filename) Succesful!");
}


function test_parse_graph_file_roundtrip() {
    const g = new Graph(false);
    g.addNode(0, 0);
    g.addNode(10, 10);
    g.addEdge(0, 1, 4);
    const text = JSON.stringify(graphToJSON(g));

    const data = parseGraphFile(text);
    assert.deepStrictEqual(validateGraphData(data), [], "parsed file is valid");
    assert.strictEqual(data.nodes.length, 2, "nodes recovered");
    assert.strictEqual(data.edges.length, 1, "edges recovered");
    console.log("IO Test 7 (parse graph file) Succesful!");
}


function test_parse_graph_file_rejects_bad_input() {
    assert.throws(() => parseGraphFile("not json at all"), /Not valid JSON/, "non-JSON rejected");
    assert.throws(
        () => parseGraphFile(JSON.stringify({ format: "nope", version: 1, directed: false, nodes: [], edges: [] })),
        /not a visual-graph-algorithms file/,
        "wrong format marker rejected"
    );
    console.log("IO Test 8 (parse rejects bad input) Succesful!");
}


function test_import_plan() {
    const workspaces = { undirected: new Graph(false), directed: new Graph(true) };
    workspaces.undirected.addNode(0, 0);   // undirected workspace non-empty

    // Loading an undirected graph into a non-empty undirected workspace.
    const same = importPlan({ directed: false }, workspaces, "undirected");
    assert.strictEqual(same.mode, "undirected", "targets the undirected workspace");
    assert.strictEqual(same.sameMode, true, "same as active mode");
    assert.strictEqual(same.needsConfirm, true, "non-empty target needs confirmation");
    assert(/undirected graph will be replaced/.test(same.message), "message names the target mode");

    // Loading an undirected graph into an empty directed workspace — the
    // mode differs but nothing is overwritten, so no confirmation is needed.
    const diff = importPlan({ directed: false }, workspaces, "directed");
    assert.strictEqual(diff.sameMode, false, "mode differs from active");
    assert.strictEqual(diff.needsConfirm, true, "undirected workspace is non-empty here too");

    // Loading a directed graph into an empty directed workspace: no confirm.
    const clean = importPlan({ directed: true }, workspaces, "undirected");
    assert.strictEqual(clean.mode, "directed", "targets the directed workspace");
    assert.strictEqual(clean.needsConfirm, false, "empty target needs no confirmation");
    console.log("IO Test 9 (import plan) Succesful!");
}


test_serialize_undirected_roundtrip();
test_serialize_directed();
test_validate_accepts_valid_data();
test_validate_rejects_bad_shapes();
test_validate_rejects_malformed_members();
test_export_filename();
test_parse_graph_file_roundtrip();
test_parse_graph_file_rejects_bad_input();
test_import_plan();
