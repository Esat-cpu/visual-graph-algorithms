"use strict";

const graph = new Graph();
const svg = d3.select("#graph-svg");
const edgesLayer = svg.select("#edges-layer");
const nodesLayer = svg.select("#nodes-layer");

let locked = false;
let dragSource = null;
let pendingEdge = null;
let dragStartX = 0;
let dragStartY = 0;

const NODE_SIZE = 24;
const MIN_DISTANCE = 75;



// ── HELPERS ──
function isTooClose(x, y) {
    return graph.nodes.some(n => {
        const dx = n.x - x;
        const dy = n.y - y;
        return Math.sqrt(dx*dx + dy*dy) < MIN_DISTANCE;
    });
}

// ── RENDER ──
function render() {
    // Edges
    const edgeGroups = edgesLayer.selectAll(".edge")
        .data(graph.edges, e => `${e.source}-${e.target}`)
        .join(enter => {
            const g = enter.append("g").attr("class", "edge");
            g.append("line");
            g.append("text").attr("class", "edge-weight");
            return g;
        });

    edgeGroups.select("line")
        .attr("x1", e => graph.getNode(e.source).x)
        .attr("y1", e => graph.getNode(e.source).y)
        .attr("x2", e => graph.getNode(e.target).x)
        .attr("y2", e => graph.getNode(e.target).y)
        .attr("stroke", "#666666")
        .attr("stroke-width", 2);

    edgeGroups.select("text")
        .attr("x", e => (graph.getNode(e.source).x + graph.getNode(e.target).x) / 2)
        .attr("y", e => (graph.getNode(e.source).y + graph.getNode(e.target).y) / 2 - 8)
        .text(e => e.weight);

    // Nodes
    const nodeGroups = nodesLayer.selectAll(".node")
        .data(graph.nodes, n => n.id)
        .join(enter => {
            const g = enter.append("g").attr("class", "node");
            g.append("circle").attr("r", NODE_SIZE);
            g.append("text");
            return g;
        });

    nodeGroups.attr("transform", n => `translate(${n.x}, ${n.y})`);
    nodeGroups.select("circle")
        .attr("fill", "#3b82f6")
        .attr("stroke", "#1d4ed8")
        .attr("stroke-width", 2);
    nodeGroups.select("text").text(n => n.id);

    // Right drag — add edge
    nodeGroups.on("mousedown", function(event) {
        if (event.button !== 2) return;

        event.preventDefault();
        dragStartX = event.clientX;
        dragStartY = event.clientY;

        const d = d3.select(this).datum();
        dragSource = d;

        dragLine
            .attr("x1", d.x).attr("y1", d.y)
            .attr("x2", d.x).attr("y2", d.y)
            .attr("opacity", 1);
    });


    // Stats
    document.getElementById("stat-nodes").textContent = graph.nodes.length;
    document.getElementById("stat-edges").textContent = graph.edges.length;
}

// ── DRAG LINE (temporary line while dragging) ──
const dragLine = svg.append("line")
    .attr("class", "drag-line")
    .attr("stroke", "#3b82f6")
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", "6,3")
    .attr("opacity", 0);


d3.select("#graph-container")
    .on("mousemove", function(event) {
        if (!dragSource) return;
        const [x, y] = d3.pointer(event, svg.node());
        dragLine.attr("x2", x).attr("y2", y);
    })
    .on("mouseup", function(event) {
        if (!dragSource) return;

        const [x, y] = d3.pointer(event, svg.node());
        const dx = event.clientX - dragStartX;
        const dy = event.clientY - dragStartY;
        const dist = Math.sqrt(dx*dx + dy*dy);

        const targetNode = graph.nodes.find(n => {
            const nx = n.x - x;
            const ny = n.y - y;
            return Math.sqrt(nx*nx + ny*ny) < (NODE_SIZE + 10) && n.id !== dragSource.id;
        });

        if (targetNode) {
            // Edge add/remove
            if (graph.hasEdge(dragSource.id, targetNode.id)) {
                graph.edges = graph.edges.filter(e =>
                    !(e.source === dragSource.id && e.target === targetNode.id) &&
                    !(e.source === targetNode.id && e.target === dragSource.id)
                );
                render();
            } else {
                pendingEdge = { source: dragSource.id, target: targetNode.id };
                showWeightModal();
            }
        } else if (dist < 5) {
            // No drag — remove node
            graph.nodes = graph.nodes.filter(n => n.id !== dragSource.id);
            graph.edges = graph.edges.filter(e => e.source !== dragSource.id && e.target !== dragSource.id);
            render();
        }

        dragLine.attr("opacity", 0);
        dragSource = null;
    });


// ── LEFT CLICK — ADD NODE ──
d3.select("#graph-container").on("click", function(event) {
    if (locked) return;
    if (event.target.closest(".node")) return;
    if (event.target.closest("#clear-graph-btn")) return;
    const [x, y] = d3.pointer(event, svg.node());
    if (isTooClose(x, y)) return;
    graph.addNode(x, y);
    render();
});

// ── CLEAR GRAPH ──
document.getElementById("clear-graph-btn").addEventListener("click", () => {
    graph.nodes = [];
    graph.edges = [];
    graph.nodeIdCounter = 0;
    render();
});


// ── WEIGHT MODAL ──
function showWeightModal() {
    const modal = document.getElementById("weight-modal");
    const input = document.getElementById("weight-input");
    modal.classList.add("show");
    input.value = "";
    input.focus();
}

function hideWeightModal() {
    document.getElementById("weight-modal").classList.remove("show");
    pendingEdge = null;
}

document.getElementById("weight-confirm").addEventListener("click", () => {
    const weight = parseFloat(document.getElementById("weight-input").value);
    if (isNaN(weight) || weight <= 0) {
        hideWeightModal();
        return;
    }
    graph.addEdge(pendingEdge.source, pendingEdge.target, weight);
    hideWeightModal();
    render();
});

document.getElementById("weight-cancel").addEventListener("click", hideWeightModal);

// Enter key to confirm
document.getElementById("weight-input").addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("weight-confirm").click();
    if (e.key === "Escape") hideWeightModal();
});

// Prevent context menu on right click
document.addEventListener("contextmenu", e => e.preventDefault());

render();
