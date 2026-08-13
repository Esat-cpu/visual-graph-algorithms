"use strict";

// ── GRAPH FILE I/O ──
// Serialize / parse the active graph to and from a plain JSON file so users
// can save their work and reload it later. One module handles both directions
// because the format is shared.
//
// File format (v1):
// {
//   format: "vga",           // visual-graph-algorithms
//   version: 1,
//   directed: true|false,    // which workspace mode this file belongs to
//   nodeIdCounter: N,        // so future node ids never collide with saved ones
//   nodes: [{id, x, y}, ...],
//   edges: [{source, target, weight}, ...]
// }


// The JSON payload for a graph, ready to be written to disk.
function graphToJSON(graph) {
    return {
        format: "vga",
        version: 1,
        directed: graph.directed,
        nodeIdCounter: graph.nodeIdCounter,
        nodes: graph.nodes.map(n => ({ id: n.id, x: n.x, y: n.y })),
        edges: graph.edges.map(e => ({ source: e.source, target: e.target, weight: e.weight }))
    };
}


// Trigger a browser download of `text` under the given filename.
function downloadFile(filename, text) {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}


// Whether a parsed payload has the shape the app expects. Returns a list of
// problems (empty array = valid), so callers can show a precise error.
function validateGraphData(data) {
    const problems = [];
    if (!data || typeof data !== "object") {
        problems.push("file does not contain an object");
        return problems;
    }
    if (data.format !== "vga") problems.push("not a visual-graph-algorithms file");
    if (data.version !== 1) problems.push("unsupported file version");
    if (typeof data.directed !== "boolean") problems.push("missing directed flag");
    if (!Array.isArray(data.nodes)) problems.push("missing nodes list");
    if (!Array.isArray(data.edges)) problems.push("missing edges list");

    if (Array.isArray(data.nodes)) {
        data.nodes.forEach((n, i) => {
            if (!n || typeof n.id !== "number" || typeof n.x !== "number" || typeof n.y !== "number") {
                problems.push(`node #${i} is malformed`);
            }
        });
    }
    if (Array.isArray(data.edges)) {
        data.edges.forEach((e, i) => {
            if (!e || typeof e.source !== "number" || typeof e.target !== "number" ||
                typeof e.weight !== "number") {
                problems.push(`edge #${i} is malformed`);
            }
        });
    }
    return problems;
}


// The filename for a graph export, e.g. graph-undirected.json.
function exportFilename(graph) {
    const mode = graph.directed ? "directed" : "undirected";
    return `graph-${mode}.json`;
}


// Parse a file's text into the validated JSON payload. Throws an Error with a
// human-readable message on any failure (bad JSON, wrong format, malformed).
function parseGraphFile(text) {
    let data;
    try {
        data = JSON.parse(text);
    } catch (err) {
        throw new Error("Not valid JSON");
    }
    const problems = validateGraphData(data);
    if (problems.length > 0) {
        throw new Error(problems[0]);
    }
    return data;
}


// Work out what an import would do to the current workspaces, WITHOUT touching
// them. Returns a plan the caller can confirm and then execute:
//   mode           — which workspace ("directed" / "undirected") the file has
//   sameMode       — true when that matches the active workspace mode
//   needsConfirm   — true when that workspace is currently non-empty
//   message        — the exact confirm prompt to show
//   data           — the validated payload to apply
function importPlan(data, workspaces, activeMode) {
    const mode = data.directed ? "directed" : "undirected";
    const target = workspaces[mode];
    const needsConfirm = target.nodes.length > 0 || target.edges.length > 0;
    return {
        mode,
        sameMode: mode === activeMode,
        needsConfirm,
        message: `Your current ${mode} graph will be replaced by the loaded one. Continue?`,
        data
    };
}


if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        graphToJSON,
        downloadFile,
        validateGraphData,
        exportFilename,
        parseGraphFile,
        importPlan
    };
}
