"use strict";

// ── MOBILE / TOUCH WIRING ──
// Feeds raw touch events from the canvas into the pure state machine in
// touch.js and applies the returned actions to the page. Loaded after
// main.js, so it can use main.js's globals (graph, nodesLayer, render, ...)
// directly. All state lives in the machine — this file only translates
// between DOM events and machine actions.

// Only engage when the device actually has a coarse pointer (touch primary).
function isTouchDevice() {
    return (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
           ("ontouchstart" in window);
}

// 600 ms hold opens the delete confirmation; any bigger movement cancels it.
const LONG_PRESS_MS = 600;
// Small movement during a tap is tolerated (finger jitter on a touch screen
// easily exceeds 10 px); a tap is only treated as a drag beyond this.
const TAP_SLOP = 24;
// Long-press cancels if the finger wanders more than this much — separate
// from TAP_SLOP so a slightly shifty press still counts as a hold.
const LONG_PRESS_MOVE_SLOP = 34;

const machine = createTouchMachine();

const container = document.getElementById("graph-container");
const deleteBubble = document.createElement("div");
deleteBubble.className = "node-delete-bubble hidden";
deleteBubble.textContent = "DELETE";
container.appendChild(deleteBubble);

// Floating pill that tells the user which node is selected and what to do
// next — the whole tap-to-connect flow is invisible without it.
const connectHint = document.getElementById("node-connect-hint");

function setConnectHint(nodeId) {
    if (nodeId == null) {
        connectHint.classList.add("hidden");
    } else {
        connectHint.textContent = "Node " + nodeId + " selected — tap another node to connect";
        connectHint.classList.remove("hidden");
    }
}

let touchActive = false;
let touchStartX = 0;
let touchStartY = 0;
let longPressTimer = null;
let longPressNode = null;
let tapCanceled = false;
// Set once a finger that started on a node moves beyond the tap slop — the
// touch becomes a node-drag (finger repositions the node) instead of a tap.
let draggingNode = null;

// Convert a screen point to graph coordinates, undoing the zoom/pan
// transform that main.js applies to #viewport.
function graphPoint(clientX, clientY) {
    const rect = container.getBoundingClientRect();
    const t = d3.zoomTransform(svg.node());
    const p = t.invert([clientX - rect.left, clientY - rect.top]);
    return p;
}

// Find a node under a screen point. Positions are converted into graph space
// first so nodeAtPoint keeps working while the canvas is zoomed/panned.
function nodeAtPoint(clientX, clientY) {
    const [x, y] = graphPoint(clientX, clientY);
    return graph.nodes.find(n => {
        const dx = n.x - x;
        const dy = n.y - y;
        return Math.sqrt(dx*dx + dy*dy) < (NODE_SIZE + 10);
    });
}

function onDeleteBubble(clientX, clientY) {
    return document.elementFromPoint(clientX, clientY).closest(".node-delete-bubble") != null;
}

// Move a node to follow the finger. Coordinates pass through the zoom/pan
// transform (graphPoint), and the same MIN_DISTANCE spacing rule as the
// desktop drag applies so nodes can't be stacked on top of each other. A
// rejected position flashes the node red, exactly like the desktop drag.
function moveNodeTo(node, clientX, clientY) {
    if (locked) return;
    const [x, y] = graphPoint(clientX, clientY);
    const tooClose = graph.nodes.some(n => {
        if (n.id === node.id) return false;
        const dx = n.x - x;
        const dy = n.y - y;
        return Math.sqrt(dx*dx + dy*dy) < MIN_DISTANCE;
    });
    const circle = nodesLayer.selectAll(".node")
        .filter(n => n.id === node.id)
        .select("circle");
    if (tooClose) {
        circle.attr("fill", "#ef4444");
        return;
    }
    circle.attr("fill", "#3b82f6");
    node.x = x;
    node.y = y;
    queueRender();
}

function applyActions(actions) {
    actions.forEach(a => {
        switch (a.action) {
            case "select":
                nodesLayer.selectAll(".node").classed("node-selected", false);
                nodesLayer.selectAll(".node")
                    .filter(d => d.id === a.nodeId)
                    .classed("node-selected", true);
                setConnectHint(a.nodeId);
                break;

            case "connect":
                pendingEdge = { source: a.source, target: a.target };
                // The machine is back in IDLE — drop the selection ring so it
                // doesn't linger on the source node while the weight modal is
                // open (or after the edge exists).
                nodesLayer.selectAll(".node").classed("node-selected", false);
                setConnectHint(null);
                stopAnimation();
                showWeightModal();
                break;

            case "clearSelection":
                nodesLayer.selectAll(".node").classed("node-selected", false);
                setConnectHint(null);
                break;

            case "showDeleteConfirm":
                positionDeleteBubble(a.nodeId);
                deleteBubble.classList.remove("hidden");
                break;

            case "hideDeleteConfirm":
                deleteBubble.classList.add("hidden");
                break;

            case "deleteNode":
                graph.nodes = graph.nodes.filter(n => n.id !== a.nodeId);
                graph.edges = graph.edges.filter(e => e.source !== a.nodeId && e.target !== a.nodeId);
                setConnectHint(null);
                stopAnimation();
                render();
                break;
        }
    });
}

function positionDeleteBubble(nodeId) {
    const node = graph.getNode(nodeId);
    if (!node) return;
    // The bubble lives in screen space (absolute inside #graph-container),
    // so apply the zoom/pan transform to the node's graph coordinates.
    const t = d3.zoomTransform(svg.node());
    const p = t.apply([node.x, node.y]);
    deleteBubble.style.left = p[0] + "px";
    deleteBubble.style.top = p[1] + "px";
}

function clearLongPressTimer() {
    if (longPressTimer != null) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
}

// ── Touch listeners on the canvas ──
// touchstart is NON-passive so we can preventDefault: canceling the start of a
// touch suppresses the browser's native long-press (context menu + haptic,
// which on Android also fires touchcancel and kills our 600 ms timer) and the
// synthesized mouse/click events. Empty-canvas taps deliberately stay
// unprevented so the follow-up click still adds a node (desktop parity).
container.addEventListener("touchstart", (e) => {
    // Two or more fingers means a pinch-zoom (handled by d3.zoom) — don't
    // start tap/long-press state for multi-touch gestures, and drop any
    // long-press timer the first finger may already have started.
    if (e.touches.length > 1) {
        touchActive = false;
        draggingNode = null;
        clearLongPressTimer();
        return;
    }
    const t = e.changedTouches[0];

    // While a delete confirmation is open, a tap on the bubble confirms it;
    // a tap anywhere else dismisses it (and does nothing else this touch).
    if (machine.getState() === "DELETE_PENDING") {
        // Never let a synthetic click escape: on the bubble it would confirm
        // twice, elsewhere it would drop a stray node while dismissing.
        e.preventDefault();
        if (onDeleteBubble(t.clientX, t.clientY)) {
            deleteBubble.dispatchEvent(new TouchEvent("touchend", {
                bubbles: true, cancelable: true,
                changedTouches: [t]
            }));
        } else {
            applyActions(machine.handle({ type: "cancelDelete" }));
        }
        return;
    }

    touchActive = true;
    tapCanceled = false;
    draggingNode = null;
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    longPressNode = nodeAtPoint(t.clientX, t.clientY);

    if (longPressNode) {
        // Holding a node is our long-press — cancel the native one so the
        // browser doesn't vibrate / open a menu / cancel the touch, and so no
        // synthetic click adds a duplicate node afterwards.
        e.preventDefault();
        longPressTimer = setTimeout(() => {
            longPressTimer = null;
            tapCanceled = true;
            applyActions(machine.handle({ type: "longPress", nodeId: longPressNode.id }));
        }, LONG_PRESS_MS);
    }
}, { passive: false });

// Long-press on Android otherwise opens the browser's own context menu even
// when touch-action already says the browser shouldn't handle the gesture.
container.addEventListener("contextmenu", (e) => {
    e.preventDefault();
});

container.addEventListener("touchmove", (e) => {
    if (!touchActive) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    const moved = Math.sqrt(dx*dx + dy*dy);
    // A held press survives small movements; a real drag cancels the hold.
    if (moved > LONG_PRESS_MOVE_SLOP) {
        tapCanceled = true;
        clearLongPressTimer();
    }
    // Beyond the tap slop the touch is a drag, not a tap. If it started on a
    // node the finger drags that node around (same as mouse drag on desktop);
    // empty-canvas drags do nothing (panning is a two-finger pinch).
    if (moved > TAP_SLOP) {
        tapCanceled = true;
        clearLongPressTimer();
        if (!draggingNode && longPressNode) draggingNode = longPressNode;
    }
    if (draggingNode) {
        moveNodeTo(draggingNode, t.clientX, t.clientY);
    }
}, { passive: true });

container.addEventListener("touchend", (e) => {
    if (!touchActive) return;
    touchActive = false;
    clearLongPressTimer();
    // A drag is finished — it never falls through to a tap/selection. Restore
    // the normal fill in case the drag ended on a rejected (red) position.
    if (draggingNode) {
        nodesLayer.selectAll(".node")
            .filter(n => n.id === draggingNode.id)
            .select("circle")
            .attr("fill", "#3b82f6");
        draggingNode = null;
        return;
    }
    if (tapCanceled) return;

    const t = e.changedTouches[0];
    const node = nodeAtPoint(t.clientX, t.clientY);
    if (node) {
        applyActions(machine.handle({ type: "tapNode", nodeId: node.id }));
    } else {
        // Empty canvas tap clears the selection. The browser also fires a
        // synthetic click, which main.js's container handler turns into a
        // new node — so taps on empty space both clear AND add, mirroring
        // desktop left-click.
        applyActions(machine.handle({ type: "tapEmpty" }));
    }
}, { passive: true });

container.addEventListener("touchcancel", () => {
    touchActive = false;
    draggingNode = null;
    clearLongPressTimer();
}, { passive: true });

// The confirm bubble needs its own tap handler so the container-level logic
// never sees it (and its synthetic click cannot fall through to add a node).
function confirmDeleteTap(e) {
    e.stopPropagation();
    e.preventDefault();
    applyActions(machine.handle({ type: "confirmDelete" }));
}
deleteBubble.addEventListener("touchend", confirmDeleteTap, { passive: false });
deleteBubble.addEventListener("click", confirmDeleteTap);

// ── Result panel becomes a bottom sheet on narrow screens ──
const resultPanel = document.getElementById("result-panel");
const resultHeader = document.getElementById("result-panel-header");
const narrowScreen = window.matchMedia("(max-width: 900px)");

resultHeader.addEventListener("click", () => {
    if (narrowScreen.matches) {
        resultPanel.classList.toggle("open");
    }
});

// Tapping CLEAR should expand the sheet, not toggle it away.
document.getElementById("clear-btn").addEventListener("click", (e) => {
    if (narrowScreen.matches && !resultPanel.classList.contains("open")) {
        resultPanel.classList.add("open");
    }
    e.stopPropagation();
});

// ── Mobile touch hints in the status bar ──
// Kept short so it fits next to NODES/EDGES on a phone; the full instructions
// live in the help modal ("?" button).
if (isTouchDevice()) {
    document.body.classList.add("touch");
    const hint = document.querySelector("#statusbar .status-item:last-child");
    if (hint) {
        hint.textContent = "TAP A → TAP B: edge · HOLD node: delete · TAP space: add node";
    }
}
