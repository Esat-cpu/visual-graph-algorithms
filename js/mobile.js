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
const TAP_SLOP = 10;

const machine = createTouchMachine();

const container = document.getElementById("graph-container");
const deleteBubble = document.createElement("div");
deleteBubble.className = "node-delete-bubble hidden";
deleteBubble.textContent = "DELETE";
container.appendChild(deleteBubble);

let touchActive = false;
let touchStartX = 0;
let touchStartY = 0;
let longPressTimer = null;
let longPressNode = null;
let tapCanceled = false;

// Find a node under a screen point. Positions are in SVG user units, which
// equal CSS pixels because the SVG has no viewBox.
function nodeAtPoint(clientX, clientY) {
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    return graph.nodes.find(n => {
        const dx = n.x - x;
        const dy = n.y - y;
        return Math.sqrt(dx*dx + dy*dy) < (NODE_SIZE + 10);
    });
}

function onDeleteBubble(clientX, clientY) {
    return document.elementFromPoint(clientX, clientY).closest(".node-delete-bubble") != null;
}

function applyActions(actions) {
    actions.forEach(a => {
        switch (a.action) {
            case "select":
                nodesLayer.selectAll(".node").classed("node-selected", false);
                nodesLayer.selectAll(".node")
                    .filter(d => d.id === a.nodeId)
                    .classed("node-selected", true);
                break;

            case "connect":
                pendingEdge = { source: a.source, target: a.target };
                stopAnimation();
                showWeightModal();
                break;

            case "clearSelection":
                nodesLayer.selectAll(".node").classed("node-selected", false);
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
                stopAnimation();
                render();
                break;
        }
    });
}

function positionDeleteBubble(nodeId) {
    const node = graph.getNode(nodeId);
    if (!node) return;
    deleteBubble.style.left = node.x + "px";
    deleteBubble.style.top = node.y + "px";
}

function clearLongPressTimer() {
    if (longPressTimer != null) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
}

// ── Touch listeners on the canvas ──
container.addEventListener("touchstart", (e) => {
    const t = e.changedTouches[0];

    // While a delete confirmation is open, a tap on the bubble confirms it;
    // a tap anywhere else dismisses it (and does nothing else this touch).
    if (machine.getState() === "DELETE_PENDING") {
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
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    longPressNode = nodeAtPoint(t.clientX, t.clientY);

    if (longPressNode) {
        longPressTimer = setTimeout(() => {
            longPressTimer = null;
            tapCanceled = true;
            applyActions(machine.handle({ type: "longPress", nodeId: longPressNode.id }));
        }, LONG_PRESS_MS);
    }
}, { passive: true });

container.addEventListener("touchmove", (e) => {
    if (!touchActive) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    if (Math.sqrt(dx*dx + dy*dy) > TAP_SLOP) {
        tapCanceled = true;
        clearLongPressTimer();
    }
}, { passive: true });

container.addEventListener("touchend", (e) => {
    if (!touchActive) return;
    touchActive = false;
    clearLongPressTimer();
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
if (isTouchDevice()) {
    document.body.classList.add("touch");
    const hint = document.querySelector("#statusbar .status-item:last-child");
    if (hint) {
        hint.textContent = "TAP TAP — add edge · HOLD — delete node · TAP EMPTY — new node";
    }
}
