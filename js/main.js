"use strict";

// Two independent workspaces so switching modes never converts or loses edges.
// `graph` always points at the active one; the rest of the code reads it.
const workspaces = {
    undirected: new Graph(),        // edges connect both ways
    directed: new Graph(true)       // edges only usable in source→target order
};
let graph = workspaces.undirected;
const svg = d3.select("#graph-svg");
// Layers live inside a transformed <g id="viewport"> so node/edge coordinates
// stay in graph space while zoom/pan only changes that group's transform.
const viewport = svg.select("#viewport");
const edgesLayer = viewport.select("#edges-layer");
const nodesLayer = viewport.select("#nodes-layer");
// The grid is an SVG layer, not a CSS background, so it shares the zoom/pan
// transform with the nodes and stays aligned with them at any scale.
const gridLayer = svg.select("#grid-layer");
const gridRect = gridLayer.select("#grid-fill");

let locked = false;
let dragSource = null;
// What the current mouse gesture on a node is doing: "move" (left button
// repositions the node) or "edge" (right button draws a candidate edge).
let dragMode = null;
let pendingEdge = null;
let dragStartX = 0;
let dragStartY = 0;
let currentParents = null;
let renderHandle = null;
// Set while a mouse drag is underway so the synthetic click that follows the
// button release doesn't drop a new node onto the canvas. Cleared on the next
// left mousedown, so a drag never leaves a stale "suppress" behind.
let suppressClick = false;
// Where the left button went down (for telling a drag from a click, since the
// left button no longer pans — panning moved to the right button).
let leftDownX = 0;
let leftDownY = 0;
let leftDown = false;

// Shared animation engine: all four algorithms feed their precomputed `steps`
// into this one playback object, so speed changes, stop, seek and reverse all
// behave identically no matter which algorithm is running.
const playback = new Playback();

// Base delay (ms per step) of the algorithm currently playing; the speed
// slider divides it. Stored so a live speed change can recompute the delay.
let currentBaseDelay = 0;

// Speed multiplier from the slider (0.25× … 8×, default 1×).
let currentSpeed = 1;

// Touch devices need larger touch targets and roomier node spacing.
const isTouch = (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
                ("ontouchstart" in window);
const NODE_SIZE = isTouch ? 30 : 24;
const MIN_DISTANCE = isTouch ? 90 : 75;
const EDGE_OFFSET = 10;
// Mouse movement needed before a press counts as a drag instead of a click.
// Generous enough that fast clicking (with a few px of hand jitter) still
// adds nodes, while a real drag still suppresses the trailing click.
const CLICK_SLOP = 10;



// ── HELPERS ──
function isTooClose(x, y) {
    return graph.nodes.some(n => {
        const dx = n.x - x;
        const dy = n.y - y;
        return Math.sqrt(dx*dx + dy*dy) < MIN_DISTANCE;
    });
}


function isConnected() {
    if (graph.nodes.length === 0) return true;
    const visited = new Set();
    const queue = [graph.nodes[0].id];
    while (queue.length > 0) {
        const id = queue.shift();
        if (visited.has(id)) continue;
        visited.add(id);
        graph.getNeighbours(id).forEach(n => queue.push(n));
    }
    return visited.size === graph.nodes.length;
}


// Clear any algorithm highlights and restore the default node/edge colors
function resetVisuals() {
    currentParents = null;
    nodesLayer.selectAll(".node").select("circle").attr("fill", "#3b82f6");
    edgesLayer.selectAll(".edge").classed("edge-active", false);
    edgesLayer.selectAll(".edge").classed("edge-cycle", false);
    edgesLayer.selectAll(".edge").select("line").attr("stroke", "#666666").attr("stroke-width", 2);
}


// ── RUN / PLAYBACK BAR ──
// The RUN button doubles as the stop button while an animation is playing.
function setRunButtonPlaying(playing) {
    const btn = document.getElementById("run-btn");
    if (!btn) return;
    btn.textContent = playing ? "■ STOP" : "▶ RUN";
    btn.classList.toggle("playing", playing);
}

// Disable RUN while the active graph has no nodes — animating an empty graph
// would just paint an empty trace.
function updateRunDisabled() {
    const btn = document.getElementById("run-btn");
    if (!btn) return;
    btn.disabled = graph.nodes.length === 0;
    btn.classList.toggle("disabled", btn.disabled);
}

function showTransport() {
    document.getElementById("transport-group").classList.remove("hidden");
}

function hideTransport() {
    document.getElementById("transport-group").classList.add("hidden");
}

// Reflect the playback position on the scrubber + its label. The scrubber
// range runs 0…steps.length, so the far right is the completed state.
function updateScrubberPosition(pos) {
    const scrubber = document.getElementById("scrubber");
    const label = document.getElementById("scrub-label");
    if (!scrubber || !label) return;
    const clamped = Math.max(0, Math.min(pos, playback.total));
    scrubber.value = String(clamped);
    label.textContent = `${clamped} / ${playback.total}`;
}

playback.onPosition = updateScrubberPosition;

// Common entry point for every algorithm animation. Computes the step delay
// from the current speed, wires the scrubber to the trace and hands the whole
// thing to the shared Playback engine. `onDone` receives the direction: 1 when
// the trace ended normally, -1 when it was rewound all the way back.
function beginPlayback(steps, baseDelay, onTick, onDone) {
    stopAnimation();                 // clear any previous session
    startLock();
    setRunButtonPlaying(true);
    currentBaseDelay = baseDelay;
    currentSpeed = parseFloat(document.getElementById("speed-slider").value) || 1;

    const scrubber = document.getElementById("scrubber");
    scrubber.max = String(steps.length);
    updateScrubberPosition(0);
    showTransport();

    playback.start(
        steps,
        onTick,
        (dir) => {
            onDone(dir);
            stopLock();
            setRunButtonPlaying(false);
        },
        Math.round(baseDelay / currentSpeed)
    );
}

// The completed state shows special visuals (shortest-path parents, negative
// cycle glow, unlocked graph). Rewinding back into the steps must undo those
// before any earlier frame is rendered.
function leaveDone() {
    startLock();
    resetVisuals();
}

// REV toggles continuous reverse playback. Pressed while running it simply
// flips the direction; pressed after completion it leaves the done state and
// rewinds from the last step.
function toggleReversePlayback() {
    if (playback.total === 0) return;
    if (playback.running) {
        playback.setDirection(playback.direction === 1 ? -1 : 1);
        return;
    }
    if (playback.atEnd) leaveDone();
    playback.setDirection(-1);
    playback.play();
}

// Dragging the scrubber seeks anywhere in the trace; seeking out of the done
// state back into the steps first undoes the completion visuals.
document.getElementById("scrubber").addEventListener("input", function() {
    const target = parseInt(this.value, 10);
    if (playback.atEnd && target < playback.total) leaveDone();
    playback.seek(target);
});

document.getElementById("rev-btn").addEventListener("click", toggleReversePlayback);

// Speed slider: value shown live, and while an animation runs it takes effect
// on the very next step.
document.getElementById("speed-slider").addEventListener("input", function() {
    currentSpeed = parseFloat(this.value) || 1;
    document.getElementById("speed-label").textContent = `${currentSpeed}×`;
    if (playback.running && currentBaseDelay) {
        playback.setDelay(Math.round(currentBaseDelay / currentSpeed));
    }
});


// Compute line endpoints + weight label position for one edge.
// Bidirectional pairs (A→B and B→A in directed mode) are pushed apart
// symmetrically so the two edges and their labels do not overlap.
// `reverseKeys` lists "source-target" keys for every directed edge that has a
// counterpart in the opposite direction; it is built once per render so this
// check stays O(1) per edge instead of rescanning all edges.
function edgeGeometry(e, reverseKeys) {
    const a = graph.getNode(e.source);
    const b = graph.getNode(e.target);

    // Direction unit vector from a to b
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx*dx + dy*dy) || 1;
    const ux = dx / len;
    const uy = dy / len;

    // Reverse edges sit on opposite sides; the perpendicular of opposite
    // directions already flips, so a constant side is enough.
    let side = 0;
    if (graph.directed && reverseKeys.has(e.source + "-" + e.target)) {
        side = 1;
    }

    // Perpendicular offset vector (perpendicular to the a→b direction)
    const nx = (-dy / len) * EDGE_OFFSET * side;
    const ny = (dx / len) * EDGE_OFFSET * side;

    // Stop the line at the node boundary so the arrowhead is not hidden
    // under the node circle.
    const R = NODE_SIZE;

    return {
        ax: a.x, ay: a.y,                       // edge endpoints (for labels)
        ux, uy, len,                            // direction + length
        ox: nx, oy: ny,                         // perpendicular offset
        midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2,
        x1: a.x + ux * R + nx, y1: a.y + uy * R + ny,
        x2: b.x - ux * R + nx, y2: b.y - uy * R + ny
    };
}


// ── WEIGHT LABEL PLACEMENT ──
// Labels used to sit at the exact midpoint of every edge. When several edges
// cross the same area (nodes laid out on a straight line, say), midpoints can
// coincide and the labels overlap — especially with multi-digit weights.
// Instead of pushing a label perpendicular to its edge (which visually
// detaches it), we slide it ALONG its own line: it always stays on the segment
// it belongs to, so which edge a label describes stays obvious. Short edges
// get priority for the midpoint because they have the least room to move;
// long edges dodge to the nearest free spot on their line.
const LABEL_CHAR_W = 8.4;        // JetBrains Mono 14px ≈ 0.6 × font-size
const LABEL_H = 16;              // label box height used for collision tests
const LABEL_GAP = 4;             // minimum gap between two label boxes
const LABEL_T_LIMIT = 0.25;      // keep labels in the middle of the line

// Candidate spots used to be checked against every already-placed label and
// every node — O(E²) work repeated on each mouse move during a drag. A uniform
// grid fixes that: every box is registered in each cell it touches, so two
// intersecting boxes always share a cell, and a candidate only needs to look
// at the boxes in its own cells.
const GRID_CELL = 64;

function gridInsert(cells, box) {
    for (let cx = Math.floor(box.x / GRID_CELL); cx <= Math.floor((box.x + box.w) / GRID_CELL); cx++)
        for (let cy = Math.floor(box.y / GRID_CELL); cy <= Math.floor((box.y + box.h) / GRID_CELL); cy++) {
            const key = cx + "," + cy;
            (cells.get(key) || cells.set(key, []).get(key)).push(box);
        }
}

// Boxes that share a cell with `box` — every possible collision lives there.
function gridNearby(cells, box) {
    const nearby = [];
    for (let cx = Math.floor(box.x / GRID_CELL); cx <= Math.floor((box.x + box.w) / GRID_CELL); cx++)
        for (let cy = Math.floor(box.y / GRID_CELL); cy <= Math.floor((box.y + box.h) / GRID_CELL); cy++) {
            const list = cells.get(cx + "," + cy);
            if (list) for (let i = 0; i < list.length; ++i) nearby.push(list[i]);
        }
    return nearby;
}

// Candidate label spots, ordered best-first:
// 1) the midpoint, then sliding along the line — the label stays attached to
//    its edge and reads unambiguously;
// 2) stacking perpendicular to the midpoint when the line itself has no free
//    room (e.g. a long edge crossing a busy row of nodes). The label then
//    floats directly above/below its own edge's middle, so the association
//    stays clear. Each level steps a full label-height away.
function labelCandidates() {
    const ts = [0.5];
    for (let d = 0.05; d <= 0.5 - LABEL_T_LIMIT; d += 0.05)
        ts.push(0.5 - d, 0.5 + d);

    const cands = ts.map(t => ({ t, p: 0 }));
    for (let k = 1; k <= 3; k++) {
        const p = k * (LABEL_H + LABEL_GAP);
        cands.push({ t: 0.5, p }, { t: 0.5, p: -p });
    }
    return cands;
}

function boxesIntersect(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x &&
           a.y < b.y + b.h && a.y + a.h > b.y;
}

// Compute a collision-free position for every edge's weight label.
// Returns a Map keyed by "source-target" → { x, y }.
function placeWeightLabels(geometry) {
    // Node circles and placed labels share one grid, so a candidate spot only
    // needs to check its local neighbourhood instead of every label + node.
    const cells = new Map();
    graph.nodes.forEach(n => gridInsert(cells, {
        x: n.x - NODE_SIZE, y: n.y - NODE_SIZE,
        w: NODE_SIZE * 2, h: NODE_SIZE * 2
    }));

    // Shorter edges are processed first so they keep the midpoint.
    const order = [...graph.edges]
        .map(e => ({ e, g: geometry.get(e) }))
        .sort((a, b) => a.g.len - b.g.len);

    const result = new Map();

    order.forEach(({ e, g }) => {
        const w = String(e.weight).length * LABEL_CHAR_W;
        const h = LABEL_H;

        let best = { x: g.midX + g.ox, y: g.midY + g.oy - 8 };   // midpoint fallback

        for (const { t, p } of labelCandidates()) {
            // Point on the line at fraction t, then the perpendicular offset
            // (ox, oy) of the edge itself, then any stacked offset p along the
            // perpendicular direction (-uy, ux); the -8 lifts the text up.
            const x = g.ax + g.len * g.ux * t + g.ox - g.uy * p;
            const y = g.ay + g.len * g.uy * t + g.oy + g.ux * p - 8;
            const box = { x: x - w / 2, y: y - h / 2, w, h };

            // Reject spots that collide with another label or with a node
            if (gridNearby(cells, box).some(b => boxesIntersect(b, box))) continue;

            best = { x, y };
            break;
        }

        gridInsert(cells, {
            x: best.x - w / 2, y: best.y - h / 2, w, h
        });
        result.set(`${e.source}-${e.target}`, best);
    });

    return result;
}


// Briefly show a red message in the bottom status bar, then restore it
function flashStatus(message) {
    const statusEl = document.querySelector(".status-item:last-child");
    const original = statusEl.textContent;
    statusEl.textContent = message;
    statusEl.style.color = "#ef4444";
    setTimeout(() => {
        statusEl.textContent = original;
        statusEl.style.color = "";
    }, 3000);
}


// ── RENDER ──
function render() {
    // Edge geometry depends only on node positions, so it is computed once per
    // render and shared by the label placement and the line drawing below —
    // not recomputed five times per edge on every mouse move.
    const edgeKeys = new Set(graph.edges.map(e => `${e.source}-${e.target}`));
    const reverseKeys = new Set(graph.edges
        .filter(e => edgeKeys.has(`${e.target}-${e.source}`))
        .map(e => `${e.source}-${e.target}`));
    const geometry = new Map(graph.edges.map(e => [e, edgeGeometry(e, reverseKeys)]));

    // Compute a collision-free spot for every weight label once, so all
    // edges agree on the layout before any of them draws.
    const labelPositions = placeWeightLabels(geometry);

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
        .attr("x1", e => geometry.get(e).x1)
        .attr("y1", e => geometry.get(e).y1)
        .attr("x2", e => geometry.get(e).x2)
        .attr("y2", e => geometry.get(e).y2)
        .attr("stroke", "#666666")
        .attr("stroke-width", 2)
        // Arrows only make sense in directed mode
        .attr("marker-end", graph.directed ? "url(#arrowhead)" : null);

    edgeGroups.select("text")
        .attr("x", e => labelPositions.get(`${e.source}-${e.target}`).x)
        .attr("y", e => labelPositions.get(`${e.source}-${e.target}`).y)
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

    // Selection is a transient touch state, never part of the graph. Clearing
    // it on every render prevents a stale highlight ring from surviving a
    // re-render (import, mode switch, connect, clear, ...).
    nodeGroups.classed("node-selected", false);

    nodeGroups.attr("transform", n => `translate(${n.x}, ${n.y})`);
    nodeGroups.select("circle")
        .attr("fill", "#3b82f6")
        .attr("stroke", "#1d4ed8")
        .attr("stroke-width", 2);
    nodeGroups.select("text").text(n => n.id);

    // Node mouse gestures: LEFT-drag moves the node, RIGHT-drag draws a
    // candidate edge (release on another node adds/removes it, a short
    // right-click removes the node). Touch devices use mobile.js instead.
    nodeGroups.on("mousedown", function(event) {
        if (event.button !== 0 && event.button !== 2) return;
        if (locked) return;

        event.preventDefault();
        dragStartX = event.clientX;
        dragStartY = event.clientY;

        const d = d3.select(this).datum();
        dragSource = d;
        dragMode = event.button === 0 ? "move" : "edge";

        if (dragMode === "edge") {
            dragLine
                .attr("x1", d.x).attr("y1", d.y)
                .attr("x2", d.x).attr("y2", d.y)
                .attr("opacity", 1);
        }
    });


    // Stats
    document.getElementById("stat-nodes").textContent = graph.nodes.length;
    document.getElementById("stat-edges").textContent = graph.edges.length;

    // RUN is pointless while the canvas is empty
    updateRunDisabled();
}

// ── DRAG LINE (temporary line while dragging) ──
// Lives inside #viewport so its endpoints stay in graph coordinates.
const dragLine = viewport.append("line")
    .attr("class", "drag-line")
    .attr("stroke", "#3b82f6")
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", "6,3")
    .attr("opacity", 0);


// ── ZOOM / PAN ──
// d3.zoom handles the wheel (desktop), pinch (touch) and mouse-drag panning.
// The transform is applied to #viewport only; every coordinate conversion
// below goes through d3.pointer(event, viewport.node()) so it lands in graph
// space. Pointer-down on a node is excluded so node dragging keeps priority.
const zoom = d3.zoom()
    .scaleExtent([0.25, 5])
    .filter(function(event) {
        // Wheel zooms no matter what's under the cursor.
        if (event.type === "wheel") return true;
        if (event.type === "dblclick") return false;
        // Touch: only start a gesture for a two-finger pinch.
        if (event.type === "touchstart") return event.touches.length === 2;
        // Mouse: the RIGHT button pans the empty canvas; the left button is
        // reserved for adding nodes and dragging them.
        return event.button === 2 && !event.target.closest(".node");
    })
    .on("zoom", function(event) {
        viewport.attr("transform", event.transform);
        gridLayer.attr("transform", event.transform);
        updateGridRect();
        // Only an actual mouse-drag pan produces a follow-up click; wheel zoom
        // and touch pinch (sourceEvent "wheel"/"touchmove") never do.
        if (event.sourceEvent && event.sourceEvent.type === "mousemove") suppressClick = true;
    });
svg.call(zoom);

// Size the grid fill so it always covers the visible graph area, whatever the
// current zoom/pan. (At small scales the view spans far more graph units than
// the container's pixel size, so a fixed-size rect would leave gaps.)
function updateGridRect() {
    const t = d3.zoomTransform(svg.node());
    const box = document.getElementById("graph-container");
    const w = box.clientWidth;
    const h = box.clientHeight;
    const a = t.invert([0, 0]);
    const b = t.invert([w, h]);
    const margin = 400;   // breathing room so the grid never pops at the edge
    gridRect
        .attr("x", a[0] - margin)
        .attr("y", a[1] - margin)
        .attr("width", (b[0] - a[0]) + margin * 2)
        .attr("height", (b[1] - a[1]) + margin * 2);
}
window.addEventListener("resize", updateGridRect);
updateGridRect();


// ── NODE DRAG (desktop mouse) ──
// Two node gestures share the mousedown → mousemove → mouseup pipeline:
//   LEFT button  — move the node ("move" mode),
//   RIGHT button — candidate edge to another node / remove node ("edge" mode).
// No d3.drag: its touch handlers swallow the pointer events mobile.js needs,
// and a custom handler is easily testable. Renders are deferred to the next
// animation frame so several mousemove events coalesce into one update;
// structural changes (node/edge add, remove, mode switch) render synchronously.
function queueRender() {
    if (renderHandle != null) return;
    renderHandle = requestAnimationFrame(() => {
        renderHandle = null;
        render();
    });
}

// Returns true when `x,y` is too close to a node other than `node`.
function isTooCloseTo(x, y, node) {
    return graph.nodes.some(n => {
        if (n.id === node.id) return false;
        const dx = n.x - x;
        const dy = n.y - y;
        return Math.sqrt(dx*dx + dy*dy) < MIN_DISTANCE;
    });
}

// Selection of the rendered node group for a graph node (used to flash its
// circle red while a drag position is rejected).
function nodeEl(node) {
    return nodesLayer.selectAll(".node").filter(n => n.id === node.id);
}

d3.select("#graph-container")
    // The left button no longer pans, so a left-drag on the canvas must still
    // be told apart from a plain click: remember where it went down and flag
    // any movement so the click handler can skip the node-add.
    .on("mousedown", function(event) {
        if (event.button !== 0) return;
        leftDown = true;
        suppressClick = false;
        leftDownX = event.clientX;
        leftDownY = event.clientY;
    })
    .on("mousemove", function(event) {
        if (leftDown) {
            const dx = event.clientX - leftDownX;
            const dy = event.clientY - leftDownY;
            if (dx*dx + dy*dy > CLICK_SLOP * CLICK_SLOP) suppressClick = true;
        }
        if (!dragSource || !dragMode) return;
        if (locked) return;
        const [x, y] = d3.pointer(event, viewport.node());
        if (dragMode === "move") {
            // Left-drag repositions the source node (zoom/pan coords included);
            // the spacing rule keeps nodes from piling up and flashes the node
            // red while the position is being rejected.
            if (isTooCloseTo(x, y, dragSource)) {
                nodeEl(dragSource).select("circle").attr("fill", "#ef4444");
                // Drop the pending re-render so it cannot repaint the node blue.
                if (renderHandle != null) { cancelAnimationFrame(renderHandle); renderHandle = null; }
            } else {
                nodeEl(dragSource).select("circle").attr("fill", "#3b82f6");
                dragSource.x = x;
                dragSource.y = y;
                queueRender();
            }
        } else {
            // Right-drag only previews the candidate edge.
            dragLine
                .attr("x1", dragSource.x).attr("y1", dragSource.y)
                .attr("x2", x).attr("y2", y);
        }
    })
    .on("mouseup", function(event) {
        if (event.button === 0) leftDown = false;
        if (!dragSource) return;
        const d = dragSource;
        const mode = dragMode;
        dragLine.attr("opacity", 0);
        dragSource = null;
        dragMode = null;
        // During playback the graph is locked; never mutate it mid-run, but do
        // release the drag state above so nothing sticks.
        if (locked) return;

        if (mode === "move") {
            // A left-drag move is done — the click suppression above keeps the
            // trailing click from planting a new node. Restore the normal fill
            // in case the drag ended on a rejected (red) position.
            nodeEl(d).select("circle").attr("fill", "#3b82f6");
            return;
        }

        const [x, y] = d3.pointer(event, viewport.node());
        const dx = event.clientX - dragStartX;
        const dy = event.clientY - dragStartY;
        const dist = Math.sqrt(dx*dx + dy*dy);

        const targetNode = graph.nodes.find(n => {
            const nx = n.x - x;
            const ny = n.y - y;
            return Math.sqrt(nx*nx + ny*ny) < (NODE_SIZE + 10) && n.id !== d.id;
        });

        if (targetNode) {
            // Edge add/remove. Dragging an existing edge removes it; dragging
            // a missing one opens the weight prompt to create it.
            if (graph.hasEdge(d.id, targetNode.id)) {
                // Directed: only the dragged direction is removed, so a
                // bidirectional pair can keep the opposite edge.
                graph.edges = graph.edges.filter(e => {
                    if (graph.directed)
                        return !(e.source === d.id && e.target === targetNode.id);
                    return !(e.source === d.id && e.target === targetNode.id) &&
                           !(e.source === targetNode.id && e.target === d.id);
                });
                stopAnimation();
                render();
            } else {
                pendingEdge = { source: d.id, target: targetNode.id };
                showWeightModal();
                stopAnimation();
            }
        } else if (dist < 5) {
            // No drag — remove node
            graph.nodes = graph.nodes.filter(n => n.id !== d.id);
            graph.edges = graph.edges.filter(e => e.source !== d.id && e.target !== d.id);
            stopAnimation();
            render();
        }
    });


// ── LEFT CLICK — ADD NODE ──
d3.select("#graph-container").on("click", function(event) {
    if (locked) return;
    // A mouse drag also ends with a click; don't drop a node after dragging.
    // The flag is cleared on the next left mousedown (see above).
    if (suppressClick) return;
    if (event.target.closest(".node")) return;
    if (event.target.closest("#clear-graph-btn")) return;
    const [x, y] = d3.pointer(event, viewport.node());
    if (isTooClose(x, y)) return;
    graph.addNode(x, y);
    stopAnimation();
    render();
});

// ── CLEAR GRAPH ──
document.getElementById("clear-graph-btn").addEventListener("click", () => {
    stopAnimation();
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
    const removeBtn = document.getElementById("weight-remove");
    modal.classList.add("show");
    input.value = "";
    input.focus();

    // When the pending edge already exists, offer REMOVE EDGE instead of
    // creating a duplicate (tap-tap on mobile re-opens the modal for it).
    if (removeBtn) {
        const exists = pendingEdge &&
            graph.hasEdge(pendingEdge.source, pendingEdge.target);
        removeBtn.hidden = !exists;
    }
}

function hideWeightModal() {
    document.getElementById("weight-modal").classList.remove("show");
    pendingEdge = null;
}

document.getElementById("weight-confirm").addEventListener("click", () => {
    // Any numeric weight is allowed (including negative and zero) — Dijkstra
    // and Bellman-Ford demonstrate their behavior with them, and Prim/Kruskal
    // are unaffected by the sign.
    const weight = parseFloat(document.getElementById("weight-input").value);
    if (isNaN(weight)) {
        hideWeightModal();
        return;
    }
    graph.addEdge(pendingEdge.source, pendingEdge.target, weight);
    hideWeightModal();
    render();
});

document.getElementById("weight-cancel").addEventListener("click", hideWeightModal);

// REMOVE EDGE — shown only when the pending edge already exists. Mirrors the
// right-drag removal logic: directed graphs drop only the dragged orientation,
// undirected graphs drop the pair.
document.getElementById("weight-remove").addEventListener("click", () => {
    if (!pendingEdge) return;
    graph.edges = graph.edges.filter(e => {
        if (graph.directed)
            return !(e.source === pendingEdge.source && e.target === pendingEdge.target);
        return !(e.source === pendingEdge.source && e.target === pendingEdge.target) &&
               !(e.source === pendingEdge.target && e.target === pendingEdge.source);
    });
    hideWeightModal();
    stopAnimation();
    render();
});

// Enter key to confirm
document.getElementById("weight-input").addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("weight-confirm").click();
    if (e.key === "Escape") hideWeightModal();
});



// ── ALGO BUTTONS ──
let activeAlgo = "dijkstra";

document.querySelectorAll(".app-btn[data-algo]").forEach(btn => {
    btn.addEventListener("click", () => {
        const algo = btn.dataset.algo;
        if (algo === activeAlgo) return;
        stopAnimation();

        activeAlgo = algo;
        resetVisuals();
        document.getElementById("result-content").innerHTML = '<p class="result-empty">Run an algorithm<br>to see results here.</p>';

        document.querySelectorAll(".app-btn[data-algo]").forEach(b => b.classList.remove("active"));
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


// ── GRAPH MODE SWITCH ──
// Point `graph` at the chosen workspace and redraw. Each workspace keeps its
// own nodes/edges untouched, so switching back restores the exact same state.
function switchWorkspace(name) {
    graph = workspaces[name];
    document.querySelectorAll("#graph-mode-group .app-btn").forEach(b => {
        b.classList.toggle("active", b.id === `mode-${name}`);
    });
    stopAnimation();
    resetVisuals();
    render();
}

document.getElementById("mode-undirected").addEventListener("click", () => switchWorkspace("undirected"));
document.getElementById("mode-directed").addEventListener("click", () => switchWorkspace("directed"));


// ── RUN BUTTON ──
document.getElementById("run-btn").addEventListener("click", () => {
    // While an animation is playing the same button becomes STOP.
    if (playback.running) {
        stopAnimation();
        return;
    }
    if (graph.nodes.length === 0) return;
    resetVisuals();

    if (activeAlgo === "prim" || activeAlgo === "kruskal") {
        // MST is only defined on undirected graphs — warn in the result panel
        if (graph.directed) {
            showResultWarning("⚠ MST requires an undirected graph — switch to UNDIRECTED");
            return;
        }
        if (!isConnected()) {
            flashStatus("⚠ Graph is not connected — Prim and Kruskal require a connected graph");
            return;
        }
    }

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
            animateDijkstra(steps, parents);
        } else if (activeAlgo === "bellman-ford") {
            const { steps, parents, negativeCycle, cycleEdges, cycleNodes } = bellman_ford(graph, startId);
            animateBellmanFord(steps, parents, negativeCycle, cycleEdges, cycleNodes);
        } else if (activeAlgo === "prim") {
            const { steps, mst } = prim(graph, startId);
            animatePrim(steps, mst);
        }
    } else {
        const { steps, mst } = kruskal(graph);
        animateKruskal(steps, mst);
    }
});

// Enter anywhere in the top bar (most useful right after typing a start node
// id) triggers the same action as clicking RUN.
document.getElementById("topbar").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && document.activeElement.tagName === "INPUT") {
        e.preventDefault();
        document.getElementById("run-btn").click();
    }
});


// ── EXPORT ──
// Save the ACTIVE workspace to a JSON file on the computer. Only the graph
// currently being edited is exported (per roadmap: export = active workspace).
document.getElementById("export-btn").addEventListener("click", () => {
    if (graph.nodes.length === 0 && graph.edges.length === 0) {
        flashStatus("⚠ Nothing to export yet — add some nodes first");
        return;
    }
    stopAnimation();
    downloadFile(exportFilename(graph), JSON.stringify(graphToJSON(graph), null, 2));
});


// ── HELP MODAL ──
// Usage instructions, written once per device type (mouse vs touch).
function showHelp() {
    const content = document.getElementById("help-content");
    const touch = isTouch;
    content.innerHTML = touch ? `
        <div class="help-sec">GRAPH</div>
        <div>TAP empty canvas &nbsp;—&nbsp; add node</div>
        <div>TAP node A, then TAP node B &nbsp;—&nbsp; add edge (weight prompt)</div>
        <div>TAP two connected nodes &nbsp;—&nbsp; remove edge or change weight</div>
        <div>HOLD a node &nbsp;—&nbsp; delete it</div>
        <div class="help-sec">VIEW</div>
        <div>PINCH two fingers &nbsp;—&nbsp; zoom / pan</div>
        <div class="help-sec">RUN</div>
        <div>Pick algorithm, set START, press <kbd>RUN</kbd>. Adjust speed live, use
        REV + scrubber to rewind.</div>
    ` : `
        <div class="help-sec">GRAPH</div>
        <div><kbd>LEFT CLICK</kbd> empty canvas &nbsp;—&nbsp; add node</div>
        <div><kbd>LEFT DRAG</kbd> node &nbsp;—&nbsp; move it</div>
        <div><kbd>RIGHT DRAG</kbd> node → node &nbsp;—&nbsp; add edge</div>
        <div><kbd>RIGHT DRAG</kbd> connected nodes &nbsp;—&nbsp; remove edge</div>
        <div><kbd>RIGHT CLICK</kbd> node without moving &nbsp;—&nbsp; remove it</div>
        <div class="help-sec">VIEW</div>
        <div><kbd>WHEEL</kbd> &nbsp;—&nbsp; zoom · <kbd>RIGHT DRAG</kbd> empty space &nbsp;—&nbsp; pan</div>
        <div class="help-sec">RUN</div>
        <div>Pick algorithm, set START, press <kbd>RUN</kbd>. Adjust speed live, use
        REV + scrubber to rewind.</div>
    `;
    document.getElementById("help-modal").classList.add("show");
}

function hideHelp() {
    document.getElementById("help-modal").classList.remove("show");
}

document.getElementById("help-btn").addEventListener("click", showHelp);
document.getElementById("help-close").addEventListener("click", hideHelp);
document.getElementById("help-modal").addEventListener("click", (e) => {
    if (e.target.id === "help-modal") hideHelp();
});


// ── IMPORT ──
// Load a graph from a file into its matching workspace (the loaded graph
// replaces the existing graph of that mode). Confirm first whenever that
// workspace already has a graph; if the loaded mode differs from the active
// one, switch to it afterwards.
document.getElementById("import-btn").addEventListener("click", () => {
    document.getElementById("import-input").click();
});

document.getElementById("import-input").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        let data;
        try {
            data = parseGraphFile(String(reader.result));
        } catch (err) {
            flashStatus("⚠ " + err.message);
            return;
        }

        const plan = importPlan(data, workspaces, graph.directed ? "directed" : "undirected");
        if (plan.needsConfirm) {
            document.getElementById("import-message").textContent = plan.message;
            document.getElementById("import-modal").classList.add("show");
            pendingImport = plan;
        } else {
            applyImport(plan);
        }
    };
    reader.readAsText(file);
});

// Staged import, waiting on the confirm modal.
let pendingImport = null;

document.getElementById("import-confirm").addEventListener("click", () => {
    document.getElementById("import-modal").classList.remove("show");
    const plan = pendingImport;
    pendingImport = null;
    if (plan) applyImport(plan);
});

document.getElementById("import-cancel").addEventListener("click", () => {
    document.getElementById("import-modal").classList.remove("show");
    pendingImport = null;
});

// Replace the workspace matching the loaded file's mode with its data, then
// show that workspace (switching if the loaded mode differs from active).
function applyImport(plan) {
    const target = workspaces[plan.mode];
    const data = plan.data;
    target.nodes = data.nodes.map(n => ({ id: n.id, x: n.x, y: n.y }));
    target.edges = data.edges.map(e => ({ source: e.source, target: e.target, weight: e.weight }));
    target.nodeIdCounter = data.nodeIdCounter;

    if (graph !== target) {
        switchWorkspace(plan.mode); // switchWorkspace already renders
    } else {
        stopAnimation();
        render();
    }
}


// ── ANIMATION HELPERS ──
function stopAnimation() {
    playback.stop();
    locked = false;
    document.getElementById("graph-container").classList.remove("locked");
    setRunButtonPlaying(false);
    hideTransport();
    resetVisuals();
}

function startLock() {
    locked = true;
    document.getElementById("graph-container").classList.add("locked");
}

function stopLock() {
    locked = false;
    document.getElementById("graph-container").classList.remove("locked");
}

// ── ANIMATE Dijkstra ──
// Base delays (ms per step at 1×): the speed slider divides them live.
function animateDijkstra(steps, parents) {
    beginPlayback(steps, 1200,
        // One step: paint the current node and its incident edges.
        (step) => {
            edgesLayer.selectAll(".edge")
                .select("line")
                .attr("stroke", e =>
                    (e.source === step.current || e.target === step.current) ? "#bc5dcb" : "#666666"
                )
                .attr("stroke-width", e =>
                    (e.source === step.current || e.target === step.current) ? 3 : 2
                );

            nodesLayer.selectAll(".node")
                .select("circle")
                .attr("fill", n => {
                    if (n.id === step.current) return "#10b981";
                    if (step.visited[n.id]) return "#f59e0b";
                    return "#3b82f6";
                });
            showShortestPathResult(step.distance, parents);
        },
        (dir) => {
            if (dir === 1) {
                nodesLayer.selectAll(".node").select("circle").attr("fill", "#3b82f6");
                edgesLayer.selectAll(".edge").select("line").attr("stroke", "#666666").attr("stroke-width", 2);
                currentParents = parents;
                showShortestPathResult(steps[steps.length - 1].distance, parents);
            } else {
                resetVisuals();
            }
        });
}


// ── ANIMATE BELLMAN-FORD ──
function animateBellmanFord(steps, parents, negativeCycle, cycleEdges, cycleNodes) {
    beginPlayback(steps, 1000,
        (step) => {
            // Steps without a current edge only refresh the output panel.
            if (step.current) {
                // Reset edges
                edgesLayer.selectAll(".edge").select("line").attr("stroke", "#666666").attr("stroke-width", 2);

                // Current edge — sarı
                edgesLayer.selectAll(".edge")
                    .filter(e => e.source === step.current.source && e.target === step.current.target)
                    .select("line")
                    .attr("stroke", "#f59e0b")
                    .attr("stroke-width", 3);
            }

            // Update output
            showShortestPathResult(step.distance, parents);
        },
        (dir) => {
            if (dir === 1) {
                edgesLayer.selectAll(".edge").select("line").attr("stroke", "#666666");
                nodesLayer.selectAll(".node").select("circle").attr("fill", "#3b82f6");
                currentParents = parents;
                if (negativeCycle) {
                    // Glow the negative cycle red so it is visible at a glance
                    const cycleEdgeSet = new Set(cycleEdges);
                    edgesLayer.selectAll(".edge")
                        .classed("edge-cycle", e => cycleEdgeSet.has(e));
                    nodesLayer.selectAll(".node")
                        .select("circle")
                        .attr("fill", n => cycleNodes.includes(n.id) ? "#ef4444" : "#3b82f6");
                    showNegativeCycleWarning();
                } else {
                    showShortestPathResult(steps[steps.length - 1].distance, parents);
                }
            } else {
                resetVisuals();
            }
        });
}


// ── ANIMATE PRIM ──
function animatePrim(steps, mst) {
    beginPlayback(steps, 1000,
        (step) => {
            const mstEdges = step.mst || [];

            edgesLayer.selectAll(".edge")
                .classed("edge-active", e => mstEdges.some(m =>
                    (m.source === e.source && m.target === e.target) ||
                    (m.source === e.target && m.target === e.source)
                ));

            nodesLayer.selectAll(".node")
                .select("circle")
                .attr("fill", n => n.id === step.current ? "#10b981" : "#3b82f6");
        },
        (dir) => {
            if (dir === 1) {
                edgesLayer.selectAll(".edge")
                    .classed("edge-active", e => mst.some(m =>
                        (m.source === e.source && m.target === e.target) ||
                        (m.source === e.target && m.target === e.source)
                    ));
                nodesLayer.selectAll(".node").select("circle").attr("fill", "#3b82f6");
                showMSTResult(mst);
            } else {
                resetVisuals();
            }
        });
}

// ── ANIMATE KRUSKAL ──
function animateKruskal(steps, mst) {
    beginPlayback(steps, 1000,
        (step) => {
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
        },
        (dir) => {
            if (dir === 1) {
                edgesLayer.selectAll(".edge").select("line").attr("stroke", "#666666");
                edgesLayer.selectAll(".edge")
                    .classed("edge-active", e => mst.some(m =>
                        (m.source === e.source && m.target === e.target) ||
                        (m.source === e.target && m.target === e.source)
                    ));
                showMSTResult(mst);
            } else {
                resetVisuals();
            }
        });
}


function highlightPath(targetId) {
    if (!currentParents) return;
    const savedParents = currentParents;
    resetVisuals();
    currentParents = savedParents;

    const path = [];
    let current = targetId;
    while (current !== null && current !== undefined && current !== -1) {
        path.push(current);
        current = currentParents[current];
    }

    nodesLayer.selectAll(".node")
        .select("circle")
        .attr("fill", n => path.includes(n.id) ? "#10b981" : "#3b82f6");

    // `path` is rebuilt from the target back to the source, so the edge
    // between path[i+1] and path[i] is traversed from path[i+1] → path[i].
    edgesLayer.selectAll(".edge")
        .classed("edge-active", e => {
            for (let i = 0; i < path.length - 1; i++) {
                const from = path[i + 1];
                const to = path[i];

                // Directed edges must match the exact traversal direction —
                // otherwise a bidirectional pair would light up both arrows.
                if (e.source === from && e.target === to) return true;

                // Undirected edges are stored in an arbitrary orientation,
                // so also accept the reverse (only one exists per pair).
                if (!graph.directed && e.source === to && e.target === from) return true;
            }
            return false;
        });
}


// ── RESULTS ──
// Show a warning message in the result panel (right side)
function showResultWarning(message) {
    const content = document.getElementById("result-content");
    content.innerHTML = "";
    const warning = document.createElement("p");
    warning.className = "result-empty result-warning";
    warning.textContent = message;
    content.appendChild(warning);
}


function showNegativeCycleWarning() {
    showResultWarning("⚠ Negative cycle detected — no shortest path exists");
    flashStatus("⚠ Negative cycle detected — no shortest path exists");
}


function showShortestPathResult(distance, parents) {
    const content = document.getElementById("result-content");

    // Save previous values before clearing
    const prevValues = {};
    content.querySelectorAll(".result-row").forEach(row => {
        const nodeEl = row.querySelector(".node-id span");
        const distEl = row.querySelector(".dist");
        if (nodeEl && distEl) prevValues[nodeEl.textContent] = distEl.textContent;
    });

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
        const val = distance[n.id] === Infinity ? "∞" : String(distance[n.id]);
        distEl.textContent = val;

        if (prevValues[String(n.id)] !== undefined && prevValues[String(n.id)] !== val) {
            distEl.classList.add("updated");
            setTimeout(() => distEl.classList.remove("updated"), 600);
        }

        row.appendChild(nodeEl);
        row.appendChild(distEl);
        row.style.cursor = "pointer";
        row.addEventListener("click", () => highlightPath(n.id));
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

// Test hook — lets the automated UI tests inspect the app state without
// exposing any control surface in the page itself.
if (typeof window !== "undefined") {
    window.__app = {
        workspaces,
        get graph() { return graph; },
        get activeAlgo() { return activeAlgo; },
        get playback() { return playback; },
        get locked() { return locked; },
        // mobile.js reads these as bare globals (its own <script> scope). The
        // jsdom tests eval each file in its own scope, so the shared refs are
        // re-exposed here for the test harness to rebind.
        svg, nodesLayer, NODE_SIZE, MIN_DISTANCE, render, queueRender, stopAnimation,
        get locked() { return locked; }
    };
}

render();
