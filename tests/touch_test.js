"use strict";

// Unit tests for the pure touch state machine (js/touch.js). No DOM — the
// machine only maps events to actions, so every transition is asserted on the
// action list and the resulting state.

const { createTouchMachine, TouchState } = require('../js/touch.js');
const assert = require('assert');


// Collect the action names a single event produces.
function actionNames(machine, event) {
    return machine.handle(event).map(a => a.action);
}


function test_idle_tap_node_selects() {
    const m = createTouchMachine();
    assert.deepStrictEqual(
        actionNames(m, { type: "tapNode", nodeId: 3 }),
        ["select"]
    );
    assert.strictEqual(m.getState(), TouchState.NODE_SELECTED);
    assert.strictEqual(m.getSelectedNodeId(), 3);
    console.log("Touch Test 1 (tap node selects) Succesful!");
}


function test_idle_tap_empty_does_nothing() {
    const m = createTouchMachine();
    assert.deepStrictEqual(actionNames(m, { type: "tapEmpty" }), []);
    assert.strictEqual(m.getState(), TouchState.IDLE);
    console.log("Touch Test 2 (idle empty tap no-op) Succesful!");
}


function test_tap_same_node_deselects() {
    const m = createTouchMachine();
    m.handle({ type: "tapNode", nodeId: 3 });
    assert.deepStrictEqual(
        actionNames(m, { type: "tapNode", nodeId: 3 }),
        ["clearSelection"]
    );
    assert.strictEqual(m.getState(), TouchState.IDLE);
    assert.strictEqual(m.getSelectedNodeId(), null);
    console.log("Touch Test 3 (same node deselects) Succesful!");
}


function test_tap_two_nodes_connects() {
    const m = createTouchMachine();
    m.handle({ type: "tapNode", nodeId: 1 });
    const actions = m.handle({ type: "tapNode", nodeId: 2 });
    assert.deepStrictEqual(
        actions,
        [{ action: "connect", source: 1, target: 2 }]
    );
    assert.strictEqual(m.getState(), TouchState.IDLE);
    assert.strictEqual(m.getSelectedNodeId(), null);
    console.log("Touch Test 4 (two taps connect) Succesful!");
}


function test_tap_empty_clears_selection() {
    const m = createTouchMachine();
    m.handle({ type: "tapNode", nodeId: 3 });
    assert.deepStrictEqual(actionNames(m, { type: "tapEmpty" }), ["clearSelection"]);
    assert.strictEqual(m.getState(), TouchState.IDLE);
    console.log("Touch Test 5 (empty tap clears) Succesful!");
}


function test_long_press_shows_delete_confirm() {
    const m = createTouchMachine();
    const actions = m.handle({ type: "longPress", nodeId: 7 });
    assert.deepStrictEqual(
        actions,
        [{ action: "showDeleteConfirm", nodeId: 7 }]
    );
    assert.strictEqual(m.getState(), TouchState.DELETE_PENDING);
    assert.strictEqual(m.getPendingDeleteNodeId(), 7);
    console.log("Touch Test 6 (long press) Succesful!");
}


function test_long_press_while_selected_clears_first() {
    const m = createTouchMachine();
    m.handle({ type: "tapNode", nodeId: 3 });
    const actions = m.handle({ type: "longPress", nodeId: 9 });
    assert.deepStrictEqual(
        actions,
        [
            { action: "clearSelection" },
            { action: "showDeleteConfirm", nodeId: 9 }
        ]
    );
    assert.strictEqual(m.getState(), TouchState.DELETE_PENDING);
    assert.strictEqual(m.getPendingDeleteNodeId(), 9);
    console.log("Touch Test 7 (long press while selected) Succesful!");
}


function test_long_press_while_pending_is_noop() {
    const m = createTouchMachine();
    m.handle({ type: "longPress", nodeId: 7 });
    assert.deepStrictEqual(actionNames(m, { type: "longPress", nodeId: 8 }), []);
    assert.strictEqual(m.getState(), TouchState.DELETE_PENDING);
    assert.strictEqual(m.getPendingDeleteNodeId(), 7);
    console.log("Touch Test 8 (long press already pending no-op) Succesful!");
}


function test_confirm_delete_removes_node() {
    const m = createTouchMachine();
    m.handle({ type: "longPress", nodeId: 7 });
    const actions = m.handle({ type: "confirmDelete" });
    assert.deepStrictEqual(
        actions,
        [
            { action: "deleteNode", nodeId: 7 },
            { action: "hideDeleteConfirm" }
        ]
    );
    assert.strictEqual(m.getState(), TouchState.IDLE);
    assert.strictEqual(m.getPendingDeleteNodeId(), null);
    console.log("Touch Test 9 (confirm delete) Succesful!");
}


function test_confirm_delete_in_non_delete_state_is_noop() {
    const m = createTouchMachine();
    assert.deepStrictEqual(actionNames(m, { type: "confirmDelete" }), []);
    assert.strictEqual(m.getState(), TouchState.IDLE);
    console.log("Touch Test 10 (confirm without pending no-op) Succesful!");
}


function test_tap_while_delete_pending_cancels() {
    const m = createTouchMachine();
    m.handle({ type: "longPress", nodeId: 7 });
    assert.deepStrictEqual(actionNames(m, { type: "tapNode", nodeId: 2 }), ["hideDeleteConfirm"]);
    assert.strictEqual(m.getState(), TouchState.IDLE);
    assert.strictEqual(m.getSelectedNodeId(), null);
    console.log("Touch Test 11 (tap cancels delete) Succesful!");
}


function test_tap_empty_while_delete_pending_cancels() {
    const m = createTouchMachine();
    m.handle({ type: "longPress", nodeId: 7 });
    assert.deepStrictEqual(actionNames(m, { type: "tapEmpty" }), ["hideDeleteConfirm"]);
    assert.strictEqual(m.getState(), TouchState.IDLE);
    console.log("Touch Test 12 (empty tap cancels delete) Succesful!");
}


function test_cancel_delete_hides_bubble() {
    const m = createTouchMachine();
    m.handle({ type: "longPress", nodeId: 7 });
    assert.deepStrictEqual(actionNames(m, { type: "cancelDelete" }), ["hideDeleteConfirm"]);
    assert.strictEqual(m.getState(), TouchState.IDLE);
    assert.strictEqual(m.getPendingDeleteNodeId(), null);
    console.log("Touch Test 13 (cancel delete) Succesful!");
}


function test_cancel_delete_in_non_delete_state_is_noop() {
    const m = createTouchMachine();
    assert.deepStrictEqual(actionNames(m, { type: "cancelDelete" }), []);
    assert.strictEqual(m.getState(), TouchState.IDLE);
    console.log("Touch Test 14 (cancel without pending no-op) Succesful!");
}


function test_full_selection_connect_cycle() {
    const m = createTouchMachine();
    m.handle({ type: "tapNode", nodeId: 1 });
    m.handle({ type: "tapNode", nodeId: 2 });   // connect 1 → 2
    m.handle({ type: "tapNode", nodeId: 2 });   // select 2
    m.handle({ type: "tapEmpty" });             // clear
    assert.strictEqual(m.getState(), TouchState.IDLE);
    assert.strictEqual(m.getSelectedNodeId(), null);
    console.log("Touch Test 15 (full cycle) Succesful!");
}


test_idle_tap_node_selects();
test_idle_tap_empty_does_nothing();
test_tap_same_node_deselects();
test_tap_two_nodes_connects();
test_tap_empty_clears_selection();
test_long_press_shows_delete_confirm();
test_long_press_while_selected_clears_first();
test_long_press_while_pending_is_noop();
test_confirm_delete_removes_node();
test_confirm_delete_in_non_delete_state_is_noop();
test_tap_while_delete_pending_cancels();
test_tap_empty_while_delete_pending_cancels();
test_cancel_delete_hides_bubble();
test_cancel_delete_in_non_delete_state_is_noop();
test_full_selection_connect_cycle();
