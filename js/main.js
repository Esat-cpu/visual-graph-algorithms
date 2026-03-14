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
let currentInterval = null;

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


function resetVisuals() {
    nodesLayer.selectAll(".node").select("circle").attr("fill", "#3b82f6");
    edgesLayer.selectAll(".edge").classed("edge-active", false);
    edgesLayer.selectAll(".edge").select("line").attr("stroke", "#666666").attr("stroke-width", 2);
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

    nodeGroups.call(drag);

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


// ── NODE DRAG ──
const drag = d3.drag()
    .on("start", function() {})
    .on("drag", function(event, d) {
        if (locked) return;
        const tooClose = graph.nodes.some(n => {
            if (n.id === d.id) return false;
            const dx = n.x - event.x;
            const dy = n.y - event.y;
            return Math.sqrt(dx*dx + dy*dy) < MIN_DISTANCE;
        });
        if (tooClose) {
            d3.select(this).select("circle").attr("fill", "#ef4444");
            return;
        }
        d3.select(this).select("circle").attr("fill", "#3b82f6");
        d.x = event.x;
        d.y = event.y;
        render();
    })
    .on("end", function() {
        d3.select(this).select("circle").attr("fill", "#3b82f6");
    });


d3.select("#graph-container")
    .on("mousemove", function(event) {
        if (!dragSource) return;
        const [x, y] = d3.pointer(event, svg.node());
        dragLine.attr("x2", x).attr("y2", y);
    })
    .on("mouseup", function(event) {
        if (!dragSource) return;
        if (locked) return;

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
                resetVisuals();
                render();
            } else {
                pendingEdge = { source: dragSource.id, target: targetNode.id };
                showWeightModal();
                resetVisuals();
            }
        } else if (dist < 5) {
            // No drag — remove node
            graph.nodes = graph.nodes.filter(n => n.id !== dragSource.id);
            graph.edges = graph.edges.filter(e => e.source !== dragSource.id && e.target !== dragSource.id);
            resetVisuals();
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
    resetVisuals();
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
    if (locked) return;
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



// ── ALGO BUTTONS ──
let activeAlgo = "dijkstra";

document.querySelectorAll(".algo-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        const algo = btn.dataset.algo;
        if (algo === activeAlgo) return;
        stopAnimation();

        activeAlgo = algo;
        resetVisuals();
        document.getElementById("result-content").innerHTML = '<p class="result-empty">Run an algorithm<br>to see results here.</p>';

        document.querySelectorAll(".algo-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        document.getElementById("active-algo-label").textContent = btn.textContent;

        const startGroup = document.getElementById("start-node-group");
        const startDivider = document.getElementById("start-divider");
        if (algo === "kruskal") {
            startGroup.classList.add("hidden");
        } else {
            startGroup.classList.remove("hidden");
        }
    });
});


// ── RUN BUTTON ──
document.getElementById("run-btn").addEventListener("click", () => {
    if (graph.nodes.length === 0) return;
    resetVisuals();

    if (activeAlgo !== "kruskal") {
        const startId = parseInt(document.getElementById("start-node-input").value);
        if (isNaN(startId) || !graph.getNode(startId)) {
            document.getElementById("start-node-input").style.borderColor = "#ef4444";
            setTimeout(() => {
                document.getElementById("start-node-input").style.borderColor = "";
            }, 1000);
            return;
        }

        if (activeAlgo === "dijkstra") {
            const { steps, parents } = dijkstra(graph, startId);
            animate(steps, parents);
        } else if (activeAlgo === "bellman-ford") {
            const { steps, parents } = bellman_ford(graph, startId);
            animate(steps, parents);
        } else if (activeAlgo === "prim") {
            const { steps, mst } = prim(graph, startId);
            animatePrim(steps, mst);
        }
    } else {
        const { steps, mst } = kruskal(graph);
        animateKruskal(steps, mst);
    }
});



// ── ANIMATION HELPERS ──
function stopAnimation() {
    if (currentInterval) {
        clearInterval(currentInterval);
        currentInterval = null;
        locked = false;
        document.getElementById("graph-container").classList.remove("locked");
        resetVisuals();
    }
}

function startLock() {
    locked = true;
    document.getElementById("graph-container").classList.add("locked");
}

function stopLock() {
    locked = false;
    document.getElementById("graph-container").classList.remove("locked");
}

// ── ANIMATE (Dijkstra / Bellman-Ford) ──
function animate(steps, parents) {
    stopAnimation();
    startLock();

    let i = 0;
    currentInterval = setInterval(() => {
        if (i >= steps.length) {
            clearInterval(currentInterval);
            currentInterval = null;
            nodesLayer.selectAll(".node").select("circle").attr("fill", "#3b82f6");
            stopLock();
            showShortestPathResult(steps[steps.length - 1].distance, parents);
            return;
        }

        const step = steps[i];
        nodesLayer.selectAll(".node")
            .select("circle")
            .attr("fill", n => {
                if (n.id === step.current) return "#10b981";
                if (step.visited[n.id]) return "#f59e0b";
                return "#3b82f6";
            });
        i++;
    }, 1000);
}


// ── ANIMATE PRIM ──
function animatePrim(steps, mst) {
    stopAnimation();
    startLock();

    let i = 0;
    currentInterval = setInterval(() => {
        if (i >= steps.length) {
            clearInterval(currentInterval);
            currentInterval = null;
            edgesLayer.selectAll(".edge")
                .classed("edge-active", e => mst.some(m =>
                    (m.source === e.source && m.target === e.target) ||
                    (m.source === e.target && m.target === e.source)
                ));
            nodesLayer.selectAll(".node").select("circle").attr("fill", "#3b82f6");
            stopLock();
            showMSTResult(mst);
            return;
        }

        const step = steps[i];
        const mstEdges = step.mst || [];

        edgesLayer.selectAll(".edge")
            .classed("edge-active", e => mstEdges.some(m =>
                (m.source === e.source && m.target === e.target) ||
                (m.source === e.target && m.target === e.source)
            ));

        nodesLayer.selectAll(".node")
            .select("circle")
            .attr("fill", n => n.id === step.current ? "#10b981" : "#3b82f6");

        i++;
    }, 1000);
}

// ── ANIMATE KRUSKAL ──
function animateKruskal(steps, mst) {
    stopAnimation();
    startLock();

    let i = 0;
    currentInterval = setInterval(() => {
        if (i >= steps.length) {
            clearInterval(currentInterval);
            edgesLayer.selectAll(".edge").select("line").attr("stroke", "#666666");
            currentInterval = null;
            edgesLayer.selectAll(".edge")
                .classed("edge-active", e => mst.some(m =>
                    (m.source === e.source && m.target === e.target) ||
                    (m.source === e.target && m.target === e.source)
                ));
            stopLock();
            showMSTResult(mst);
            return;
        }

        const step = steps[i];
        const mstEdges = step.mst || [];

        // Current edge — sarı
        edgesLayer.selectAll(".edge")
            .select("line")
            .attr("stroke", e =>
                (e.source === step.current.source && e.target === step.current.target) ? "#f59e0b" : "#666666"
            );

        // MST edges — yeşil parlak
        edgesLayer.selectAll(".edge")
            .classed("edge-active", e => mstEdges.some(m =>
                (m.source === e.source && m.target === e.target) ||
                (m.source === e.target && m.target === e.source)
            ));

        i++;
    }, 1000);
}


// ── RESULTS ──
function showShortestPathResult(distance, parents) {
    const content = document.getElementById("result-content");
    content.innerHTML = "";

    const title = document.createElement("div");
    title.className = "result-section-title";
    title.textContent = "SHORTEST PATHS";
    content.appendChild(title);

    graph.nodes.forEach(n => {
        const row = document.createElement("div");
        row.className = "result-row";

        const nodeEl = document.createElement("span");
        nodeEl.className = "node-id";
        nodeEl.innerHTML = `<span>${n.id}</span>`;

        const distEl = document.createElement("span");
        distEl.className = "dist";
        distEl.textContent = distance[n.id] === Infinity ? "∞" : distance[n.id];

        row.appendChild(nodeEl);
        row.appendChild(distEl);
        content.appendChild(row);
    });
}



function showMSTResult(mst) {
    const content = document.getElementById("result-content");
    content.innerHTML = "";

    const title = document.createElement("div");
    title.className = "result-section-title";
    title.textContent = "MST EDGES";
    content.appendChild(title);

    let total = 0;
    mst.forEach(e => {
        total += e.weight;
        const row = document.createElement("div");
        row.className = "result-row";
        row.innerHTML = `<span class="node-id">${e.source} — ${e.target}</span><span class="dist">${e.weight}</span>`;
        content.appendChild(row);
    });

    const totalRow = document.createElement("div");
    totalRow.className = "result-row";
    totalRow.style.marginTop = "8px";
    totalRow.innerHTML = `<span class="result-section-title">TOTAL</span><span class="dist">${total}</span>`;
    content.appendChild(totalRow);
}


document.getElementById("clear-btn").addEventListener("click", () => {
    document.getElementById("result-content").innerHTML = '<p class="result-empty">Run an algorithm<br>to see results here.</p>';
    resetVisuals();
});

// Prevent context menu on right click
document.addEventListener("contextmenu", e => e.preventDefault());

render();
