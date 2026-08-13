"use strict";

// ── TOUCH STATE MACHINE (pure, DOM-free) ──
// Keeps all touch interaction logic in one place so it can be unit-tested
// without a browser. `mobile.js` feeds it raw touch events and applies the
// returned actions to the page.
//
// States:
//   IDLE            — nothing selected
//   NODE_SELECTED   — one node highlighted, waiting for a second tap
//   DELETE_PENDING  — long-press delete confirmation bubble is open
//
// Events (the input side):
//   tapEmpty          — touch on empty canvas
//   tapNode {nodeId}  — touch on a node
//   longPress {nodeId}— 600 ms hold on a node
//   confirmDelete     — confirm the pending node deletion
//   cancelDelete      — dismiss the pending deletion
//
// Actions (the output side, consumed by mobile.js):
//   select            — highlight nodeId as the current selection
//   connect           — add edge source→target (opens the weight modal)
//   clearSelection    — drop the current selection highlight
//   showDeleteConfirm — open the red confirm bubble for nodeId
//   hideDeleteConfirm — close the confirm bubble
//   deleteNode        — remove nodeId from the graph

const TouchState = {
    IDLE: "IDLE",
    NODE_SELECTED: "NODE_SELECTED",
    DELETE_PENDING: "DELETE_PENDING"
};

function createTouchMachine() {
    let state = TouchState.IDLE;
    let selectedNodeId = null;
    let pendingDeleteNodeId = null;

    function getState() { return state; }
    function getSelectedNodeId() { return selectedNodeId; }
    function getPendingDeleteNodeId() { return pendingDeleteNodeId; }

    function transition(next, actions) {
        state = next;
        if (next !== TouchState.NODE_SELECTED) selectedNodeId = null;
        if (next !== TouchState.DELETE_PENDING) pendingDeleteNodeId = null;
        return actions;
    }

    function handle(event) {
        const actions = [];
        switch (state) {
            case TouchState.IDLE:
                if (event.type === "tapNode") {
                    selectedNodeId = event.nodeId;
                    state = TouchState.NODE_SELECTED;
                    actions.push({ action: "select", nodeId: event.nodeId });
                } else if (event.type === "longPress") {
                    pendingDeleteNodeId = event.nodeId;
                    state = TouchState.DELETE_PENDING;
                    actions.push({ action: "showDeleteConfirm", nodeId: event.nodeId });
                }
                break;

            case TouchState.NODE_SELECTED:
                if (event.type === "tapEmpty") {
                    state = TouchState.IDLE;
                    selectedNodeId = null;
                    actions.push({ action: "clearSelection" });
                } else if (event.type === "tapNode") {
                    if (event.nodeId === selectedNodeId) {
                        // Tapping the selected node again deselects it.
                        state = TouchState.IDLE;
                        selectedNodeId = null;
                        actions.push({ action: "clearSelection" });
                    } else {
                        // Two different nodes tapped → connect them.
                        const source = selectedNodeId;
                        const target = event.nodeId;
                        state = TouchState.IDLE;
                        selectedNodeId = null;
                        actions.push({ action: "connect", source, target });
                    }
                } else if (event.type === "longPress") {
                    state = TouchState.DELETE_PENDING;
                    selectedNodeId = null;
                    pendingDeleteNodeId = event.nodeId;
                    actions.push({ action: "clearSelection" });
                    actions.push({ action: "showDeleteConfirm", nodeId: event.nodeId });
                }
                break;

            case TouchState.DELETE_PENDING:
                if (event.type === "tapEmpty" || event.type === "tapNode") {
                    // Any stray tap outside the bubble dismisses it.
                    state = TouchState.IDLE;
                    pendingDeleteNodeId = null;
                    actions.push({ action: "hideDeleteConfirm" });
                } else if (event.type === "confirmDelete") {
                    const id = pendingDeleteNodeId;
                    state = TouchState.IDLE;
                    pendingDeleteNodeId = null;
                    actions.push({ action: "deleteNode", nodeId: id });
                    actions.push({ action: "hideDeleteConfirm" });
                } else if (event.type === "cancelDelete") {
                    state = TouchState.IDLE;
                    pendingDeleteNodeId = null;
                    actions.push({ action: "hideDeleteConfirm" });
                }
                // longPress while already pending is a no-op.
                break;
        }
        return actions;
    }

    return {
        getState,
        getSelectedNodeId,
        getPendingDeleteNodeId,
        handle
    };
}

// CJS export so the unit tests can require() this module directly.
if (typeof module !== "undefined" && module.exports) {
    module.exports = { createTouchMachine, TouchState };
}
