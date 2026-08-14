"use strict";

// UI interaction tests. These run the REAL index.html DOM inside jsdom and the
// REAL main.js — only D3 is faked (a tiny chainable stand-in), because pulling
// the full browser D3 into Node is heavy and its SVG work is incidental to the
// behavior under test. A fake timer queue makes playback deterministic.

const { JSDOM } = require("jsdom");
const assert = require("assert");
const fs = require("fs");
const path = require("path");


// ── FAKE D3 ──────────────────────────────────────────────────────────────
// Implements just enough of the d3 API surface that main.js uses:
//   select / selectAll / append / attr / text / classed / style /
//   on / call / node / datum / data().join() / filter / drag / pointer
// Each DOM element carries its bound datum on __data__, so function-valued
// attrs/text/classed resolve per element exactly like real D3.
class FakeD3Selection {
    constructor(elements, container) {
        this._els = elements;
        this._container = container || (elements.length ? elements[0].parentElement : null);
    }

    get length() { return this._els.length; }

    node() { return this._els[0] || null; }
    datum() { return this._els[0] ? this._els[0].__data__ : undefined; }

    select(sel) {
        const out = [];
        for (const el of this._els) {
            const found = el.querySelector(sel);
            if (found) out.push(found);
        }
        return new FakeD3Selection(out);
    }

    selectAll(sel) {
        const out = [];
        for (const el of this._els) out.push(...el.querySelectorAll(sel));
        // Remember the parent these children came from so a data-join knows
        // where to append fresh elements.
        return new FakeD3Selection(out, this._els[0]);
    }

    append(tag) {
        const out = [];
        for (const el of this._els) {
            const child = el.ownerDocument.createElementNS(el.namespaceURI, tag);
            child.__data__ = el.__data__;
            el.appendChild(child);
            out.push(child);
        }
        return new FakeD3Selection(out);
    }

    attr(name, value) {
        if (value === undefined) return this._els[0] ? this._els[0].getAttribute(name) : undefined;
        this._els.forEach((el, i) => {
            const v = typeof value === "function" ? value(el.__data__, i, this._els) : value;
            if (v === null) el.removeAttribute(name);
            else el.setAttribute(name, String(v));
        });
        return this;
    }

    text(value) {
        if (value === undefined) return this._els[0] ? this._els[0].textContent : undefined;
        this._els.forEach((el, i) => {
            const v = typeof value === "function" ? value(el.__data__, i, this._els) : value;
            el.textContent = v == null ? "" : String(v);
        });
        return this;
    }

    classed(name, value) {
        this._els.forEach((el, i) => {
            const flag = typeof value === "function" ? value(el.__data__, i, this._els) : value;
            el.classList.toggle(name, !!flag);
        });
        return this;
    }

    style(name, value) {
        if (value === undefined) return this._els[0] ? this._els[0].style[name] : undefined;
        this._els.forEach((el, i) => {
            const v = typeof value === "function" ? value(el.__data__, i, this._els) : value;
            el.style[name] = v;
        });
        return this;
    }

    on(type, handler) {
        this._els.forEach(el => el.addEventListener(type, handler));
        return this;
    }

    call(fn) { fn(this); return this; }

    filter(fn) {
        const out = this._els.filter((el, i) => fn(el.__data__, i, this._els));
        return new FakeD3Selection(out);
    }

    data(arr, keyFn) {
        return new FakeD3Join(this, arr, keyFn || (d => d));
    }
}

// `enter.append` must create one element PER datum; everything else mirrors a
// normal selection.
class FakeD3EnterSelection {
    constructor(parent, data) {
        this._parent = parent;
        this._data = data;
    }

    append(tag) {
        const out = this._data.map(d => {
            const el = this._parent.ownerDocument.createElementNS(this._parent.namespaceURI, tag);
            el.__data__ = d;
            this._parent.appendChild(el);
            return el;
        });
        return new FakeD3Selection(out);
    }
}

// data().join(fn): clear the layer's previous children and re-enter every data
// item — the "full redraw" behavior main.js relies on per render().
class FakeD3Join {
    constructor(selection, data, keyFn) {
        this._sel = selection;
        this._data = data;
        this._keyFn = keyFn;
    }

    join(enterFn) {
        const parent = this._sel._container;
        for (const el of [...this._sel._els]) el.remove();
        const enter = new FakeD3EnterSelection(parent, this._data);
        return enterFn(enter);
    }

    get _els() { return this._sel._els; }
}

function fakeD3(document) {
    return {
        select(target) {
            if (typeof target === "string") {
                const el = document.querySelector(target);
                return new FakeD3Selection(el ? [el] : []);
            }
            return new FakeD3Selection([target]);
        },

        drag() {
            const handlers = {};
            const behavior = function (selection) {
                // d3's drag wires pointer listeners; main.js only relies on the
                // node mousedown handler it registers itself, so nothing to bind.
                selection.__dragHandlers = handlers;
                return selection;
            };
            behavior.on = (type, fn) => { handlers[type] = fn; return behavior; };
            behavior.filter = () => behavior;
            return behavior;
        },

        zoom() {
            const handlers = {};
            const behavior = function (selection) {
                // Record the handler on the actual DOM element (d3.call passes
                // the FakeD3Selection, so unwrap it) so tests can inspect the
                // zoom setup; the transform stays identity in jsdom.
                const el = (selection && selection.node) ? selection.node() : selection;
                el.__zoomHandlers = handlers;
                return selection;
            };
            behavior.on = (type, fn) => { handlers[type] = fn; return behavior; };
            behavior.scaleExtent = () => behavior;
            behavior.filter = () => behavior;
            return behavior;
        },

        zoomTransform() {
            // Identity transform: graph coords == client coords (no viewBox).
            return { k: 1, x: 0, y: 0,
                     apply(p) { return p; },
                     invert(p) { return p; } };
        },

        pointer(event, node) {
            // jsdom reports zero-sized layout boxes, so client coords are the
            // position relative to the (empty) container — fine for tests.
            const rect = node ? node.getBoundingClientRect() : { left: 0, top: 0 };
            return [event.clientX - rect.left, event.clientY - rect.top];
        }
    };
}


// ── FAKE TIMER QUEUE ─────────────────────────────────────────────────────
// Playback schedules ticks through window.setTimeout; swapping it for a manual
// queue lets tests advance the animation tick by tick, or leave it pending.
function installFakeTimers(win) {
    const queue = [];
    let nextId = 1;

    win.setTimeout = (fn, ms) => {
        const id = nextId++;
        queue.push({ id, fn, ms, fired: false });
        return id;
    };
    win.clearTimeout = (id) => {
        const item = queue.find(t => t.id === id);
        if (item) item.fired = true;
    };
    // playback.js is require()d as a CommonJS module, so its defaultScheduler
    // resolves `setTimeout` against the Node global, not the jsdom window.
    // Route the Node globals to the same queue so Playback ticks are captured.
    globalThis.setTimeout = win.setTimeout;
    globalThis.clearTimeout = win.clearTimeout;
    // render() is deferred through requestAnimationFrame; run it inline so the
    // DOM is always up to date after any structural change.
    win.requestAnimationFrame = (fn) => { fn(); return nextId++; };
    win.cancelAnimationFrame = () => {};

    return {
        fireNext() {
            const item = queue.find(t => !t.fired);
            if (!item) return null;
            item.fired = true;
            item.fn();
            return item;
        },
        // Delay of the next pending timer (for speed assertions).
        nextDelay() {
            const item = queue.find(t => !t.fired);
            return item ? item.ms : null;
        }
    };
}


// ── APP BOOTSTRAP ────────────────────────────────────────────────────────
// Load the real index.html + main.js (plus the pure graph/playback/algorithm
// modules) into one shared window scope.
function buildApp() {
    const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost/" });
    const win = dom.window;
    const doc = win.document;

    win.d3 = fakeD3(doc);
    const timers = installFakeTimers(win);

    // jsdom ships no matchMedia; mobile.js queries it for layout/pointer hints.
    win.matchMedia = win.matchMedia || function(query) {
        return { matches: false, media: query, addEventListener() {}, removeEventListener() {} };
    };

    // Expose the pure modules as window globals, exactly like <script> tags.
    win.Graph = require("../js/graph.js").Graph;
    win.Playback = require("../js/playback.js").Playback;
    win.dijkstra = require("../js/dijkstra.js").dijkstra;
    win.bellman_ford = require("../js/bellman_ford.js").bellman_ford;
    win.prim = require("../js/prim.js").prim;
    win.kruskal = require("../js/kruskal.js").kruskal;

    for (const file of ["main.js"]) {
        win.eval(fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8"));
    }

    return { dom, win, doc, timers, app: win.__app };
}
// Add a node by simulating a left-click on the canvas (goes through the real
// #graph-container click handler).
function clickCanvas(win, doc, x, y) {
    doc.getElementById("graph-container").dispatchEvent(
        new win.MouseEvent("click", { bubbles: true, cancelable: true, clientX: x, clientY: y })
    );
}


// ── TESTS ────────────────────────────────────────────────────────────────
function test_run_button_disabled_until_graph_has_nodes() {
    const { doc, app, win } = buildApp();
    const runBtn = doc.getElementById("run-btn");

    assert.strictEqual(runBtn.disabled, true, "RUN is disabled on an empty graph");

    clickCanvas(win, doc, 100, 100);
    assert.strictEqual(app.graph.nodes.length, 1, "click added a node");
    assert.strictEqual(runBtn.disabled, false, "RUN is enabled once the graph has nodes");
    assert.strictEqual(doc.getElementById("stat-nodes").textContent, "1", "stats reflect the node");
    win.close();
    console.log("UI Test 1 (run disabled) Succesful!");
}

function test_legend_and_mode_switch() {
    const { doc, app, win } = buildApp();

    assert(doc.getElementById("legend"), "legend overlay exists");

    // Workspaces stay independent when switching modes.
    clickCanvas(win, doc, 100, 100);
    assert.strictEqual(app.graph.nodes.length, 1, "undirected workspace has one node");

    doc.getElementById("mode-directed").click();
    assert.strictEqual(app.graph.nodes.length, 0, "directed workspace starts empty");
    assert(doc.getElementById("mode-directed").classList.contains("active"), "directed button is active");
    assert(!doc.getElementById("mode-undirected").classList.contains("active"), "undirected button is inactive");

    doc.getElementById("mode-undirected").click();
    assert.strictEqual(app.graph.nodes.length, 1, "switching back restores the undirected graph");
    win.close();
    console.log("UI Test 2 (legend + mode) Succesful!");
}

function test_algo_switch_updates_label_and_hides_start_input() {
    const { doc, app, win } = buildApp();

    assert.strictEqual(doc.getElementById("active-algo-label").textContent, "DIJKSTRA");
    assert(!doc.getElementById("start-node-group").classList.contains("hidden"), "start input visible for Dijkstra");

    doc.querySelector('[data-algo="kruskal"]').click();
    assert.strictEqual(app.activeAlgo, "kruskal", "active algorithm switches");
    assert.strictEqual(doc.getElementById("active-algo-label").textContent, "KRUSKAL");
    assert(doc.getElementById("start-node-group").classList.contains("hidden"), "start input hidden for Kruskal");

    doc.querySelector('[data-algo="prim"]').click();
    assert(!doc.getElementById("start-node-group").classList.contains("hidden"), "start input back for Prim");
    win.close();
    console.log("UI Test 3 (algo switch) Succesful!");
}

function test_enter_key_runs_algorithm() {
    const { doc, app, win } = buildApp();

    clickCanvas(win, doc, 100, 100);
    clickCanvas(win, doc, 300, 300);

    const input = doc.getElementById("start-node-input");
    input.value = "0";
    input.focus();

    doc.getElementById("topbar").dispatchEvent(
        new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
    );

    assert(app.playback.running === true, "Enter in the start input runs the algorithm");
    assert(!doc.getElementById("transport-group").classList.contains("hidden"), "transport bar is visible");
    assert.strictEqual(doc.getElementById("run-btn").textContent, "■ STOP", "RUN button becomes STOP");

    // STOP cancels and hides the transport bar.
    doc.getElementById("run-btn").click();
    assert(app.playback.running === false, "STOP halts playback");
    assert(doc.getElementById("transport-group").classList.contains("hidden"), "transport bar hides after STOP");
    win.close();
    console.log("UI Test 4 (enter to run) Succesful!");
}

function test_speed_slider_scales_step_delay_live() {
    const { doc, app, timers, win } = buildApp();

    clickCanvas(win, doc, 100, 100);
    clickCanvas(win, doc, 300, 300);

    // Set 2× before running: first step delay should be 1200 / 2 = 600 ms.
    const slider = doc.getElementById("speed-slider");
    slider.value = "2";
    slider.dispatchEvent(new win.Event("input", { bubbles: true }));
    assert.strictEqual(doc.getElementById("speed-label").textContent, "2×", "speed label reflects the slider");

    doc.getElementById("start-node-input").value = "0";
    doc.getElementById("run-btn").click();
    assert.strictEqual(timers.nextDelay(), 600, "first step scheduled at 2× speed");

    // Change to 4× mid-playback — the NEXT step must use 1200 / 4 = 300 ms.
    slider.value = "4";
    slider.dispatchEvent(new win.Event("input", { bubbles: true }));
    timers.fireNext();
    assert.strictEqual(timers.nextDelay(), 300, "live speed change applies to the next step");

    doc.getElementById("run-btn").click();   // STOP
    win.close();
    console.log("UI Test 5 (live speed) Succesful!");
}

function test_playback_bar_stays_after_completion() {
    const { doc, app, timers, win } = buildApp();

    clickCanvas(win, doc, 100, 100);
    clickCanvas(win, doc, 300, 300);

    doc.getElementById("start-node-input").value = "0";
    doc.getElementById("run-btn").click();

    let n = 0;
    while (timers.fireNext()) n++;
    assert(n > 0, "animation ran to completion");

    assert(app.playback.running === false, "playback finished");
    assert(!doc.getElementById("transport-group").classList.contains("hidden"), "transport bar stays for review/rewind");
    assert.strictEqual(doc.getElementById("run-btn").textContent, "▶ RUN", "RUN button restored after completion");
    assert.strictEqual(doc.getElementById("scrub-label").textContent.split(" / ")[1],
                       String(app.playback.total), "scrubber shows the full trace length");
    win.close();
    console.log("UI Test 6 (bar after completion) Succesful!");
}

function test_result_panel_is_a_bottom_sheet_on_mobile() {
    const { doc, win } = buildApp();

    // The mobile CSS targets #result-panel.bottom-sheet; if the class is ever
    // dropped from the markup the panel silently stops becoming a bottom sheet
    // on phones (the regression that this test guards against).
    const panel = doc.getElementById("result-panel");
    assert(panel.classList.contains("bottom-sheet"), "result panel carries the bottom-sheet class");
    assert(panel.classList.contains("bottom-sheet") && panel.classList.contains("open") === false,
           "panel starts collapsed to its header");

    win.close();
    console.log("UI Test 7 (bottom-sheet class) Succesful!");
}

function test_viewport_group_and_zoom_setup() {
    const { doc, win } = buildApp();

    // All node/edge layers live inside <g id="viewport"> so zoom/pan can
    // transform one group without touching graph coordinates.
    const viewport = doc.getElementById("viewport");
    assert(viewport != null, "viewport group exists");
    assert(viewport.querySelector("#edges-layer") != null, "edges layer inside viewport");
    assert(viewport.querySelector("#nodes-layer") != null, "nodes layer inside viewport");

    // The svg carries the d3.zoom behavior (with its handlers recorded).
    const svgEl = doc.getElementById("graph-svg");
    assert(svgEl.__zoomHandlers != null, "d3.zoom bound to the svg");
    assert(typeof svgEl.__zoomHandlers.zoom === "function", "zoom handler registered");

    // The grid lives in the SVG (a <pattern> fill on a huge rect), not a CSS
    // background, so it can share the zoom/pan transform with #viewport and
    // stay aligned with the nodes at any scale.
    const gridLayer = doc.getElementById("grid-layer");
    assert(gridLayer != null, "grid layer group exists");
    const gridFill = doc.getElementById("grid-fill");
    assert(gridFill != null, "grid fill rect exists");
    assert(gridFill.getAttribute("fill").includes("grid-pattern"), "grid rect uses the tiled pattern");
    assert(parseFloat(gridFill.getAttribute("width")) > 0, "grid rect is sized for the visible area");

    // Firing the zoom handler must transform BOTH the viewport and the grid.
    svgEl.__zoomHandlers.zoom({
        transform: { k: 2, x: 10, y: 20 },
        sourceEvent: { type: "wheel" }
    });
    assert(doc.getElementById("viewport").getAttribute("transform") != null,
        "viewport receives the zoom transform");
    assert(gridLayer.getAttribute("transform") != null,
        "grid layer receives the same zoom transform");

    win.close();
    console.log("UI Test 8 (viewport + zoom + grid) Succesful!");
}

function test_help_modal_opens_and_closes() {
    const { doc, win } = buildApp();

    const modal = doc.getElementById("help-modal");
    assert(!modal.classList.contains("show"), "help modal starts hidden");

    doc.getElementById("help-btn").click();
    assert(modal.classList.contains("show"), "help button opens the modal");
    const content = doc.getElementById("help-content");
    assert(content.textContent.includes("PINCH") || content.textContent.includes("WHEEL"),
           "help text mentions the zoom gesture");
    assert(content.textContent.length > 50, "help text is populated");

    doc.getElementById("help-close").click();
    assert(!modal.classList.contains("show"), "OK closes the modal");

    win.close();
    console.log("UI Test 9 (help modal) Succesful!");
}

function test_pan_does_not_add_node() {
    const { doc, win } = buildApp();

    // Simulate a pan: the zoom gesture (right-button drag) that ends far from
    // where it started should not drop a node when the synthetic click fires.
    const svgEl = doc.getElementById("graph-svg");
    svgEl.__zoomHandlers.zoom({
        transform: { k: 1, x: 50, y: 50 },
        sourceEvent: { type: "mousemove" }
    });

    clickCanvas(win, doc, 120, 120);   // this click is the pan's synthetic one
    assert(doc.getElementById("stat-nodes").textContent === "0", "no node added after pan");

    // A clean click (no pan) still adds a node. In the browser every click is
    // preceded by a mousedown, which clears the drag-suppression flag; replay
    // that press so the flag can't leak across separate interactions.
    const container = doc.getElementById("graph-container");
    container.dispatchEvent(new win.MouseEvent("mousedown", {
        bubbles: true, cancelable: true, button: 0, clientX: 200, clientY: 200
    }));
    clickCanvas(win, doc, 200, 200);
    assert(doc.getElementById("stat-nodes").textContent === "1", "plain click adds a node");

    win.close();
    console.log("UI Test 10 (pan doesn't add node) Succesful!");
}

function loadMobile(win) {
    // mobile.js runs in the same window scope as main.js and depends on its
    // globals (svg, graph, NODE_SIZE, render, ...) plus touch.js's state
    // machine. The jsdom harness evals each file in its own scope, so the
    // shared refs main.js re-exposes on window.__app are rebound here; only
    // the weight modal is stubbed (its real DOM wiring is covered elsewhere).
    const prelude = `
        var svg = window.__app.svg;
        var nodesLayer = window.__app.nodesLayer;
        var NODE_SIZE = window.__app.NODE_SIZE;
        var MIN_DISTANCE = window.__app.MIN_DISTANCE;
        var render = window.__app.render;
        var queueRender = window.__app.queueRender;
        var stopAnimation = window.__app.stopAnimation;
        var graph = window.__app.graph;
        var locked = window.__app.locked;
        var pendingEdge = null;
        var showWeightModal = function() { window.__weightModalOpened = true; };
        var d3 = window.d3;
    `;
    const mobileSrc =
        fs.readFileSync(path.join(__dirname, "..", "js", "touch.js"), "utf8") + "\n" +
        fs.readFileSync(path.join(__dirname, "..", "js", "mobile.js"), "utf8");
    win.eval(prelude + mobileSrc);
}

// Dispatch a single tap (touchstart + touchend) at client coords, the way a
// finger would land on the canvas.
function tapAt(win, doc, x, y) {
    touchStartAt(win, doc, x, y);
    touchEndAt(win, doc, x, y);
}

function touchStartAt(win, doc, x, y) {
    const container = doc.getElementById("graph-container");
    const touch = { clientX: x, clientY: y };
    container.dispatchEvent(new win.TouchEvent("touchstart", {
        bubbles: true, cancelable: true, touches: [touch], changedTouches: [touch]
    }));
}

function touchEndAt(win, doc, x, y) {
    const container = doc.getElementById("graph-container");
    const touch = { clientX: x, clientY: y };
    container.dispatchEvent(new win.TouchEvent("touchend", {
        bubbles: true, cancelable: true, touches: [], changedTouches: [touch]
    }));
}

function touchMoveTo(win, doc, x, y) {
    const container = doc.getElementById("graph-container");
    const touch = { clientX: x, clientY: y };
    container.dispatchEvent(new win.TouchEvent("touchmove", {
        bubbles: true, cancelable: true, touches: [touch], changedTouches: [touch]
    }));
}

function test_mobile_script_loads_after_main() {
    const { doc, win } = buildApp();
    loadMobile(win);

    assert(doc.querySelector(".node-delete-bubble") != null, "delete bubble element created");
    // touch.js's createTouchMachine was invoked by mobile.js already — if the
    // wiring were broken, the eval above would have thrown.

    win.close();
    console.log("UI Test 11 (mobile script loads) Succesful!");
}

function test_touch_tap_to_connect_and_hint() {
    const { doc, win } = buildApp();
    loadMobile(win);

    // Export/Import always share one row.
    const ioGroup = doc.getElementById("io-group");
    assert(ioGroup != null, "io-group wrapper exists");
    assert(ioGroup.querySelector("#export-btn") != null, "export lives in io-group");
    assert(ioGroup.querySelector("#import-btn") != null, "import lives in io-group");

    // No selection yet: the connect hint is hidden.
    const hint = doc.getElementById("node-connect-hint");
    assert(hint.classList.contains("hidden"), "connect hint hidden initially");

    clickCanvas(win, doc, 100, 100);   // node 0
    clickCanvas(win, doc, 250, 100);   // node 1
    assert(doc.getElementById("stat-nodes").textContent === "2", "two nodes placed");

    // Tap node 0 → it becomes selected and the hint explains the next step.
    tapAt(win, doc, 100, 100);
    const selected = doc.querySelectorAll(".node.node-selected");
    assert(selected.length === 1, "exactly one node selected");
    assert(selected[0].__data__.id === 0, "node 0 is the selected one");
    assert(!hint.classList.contains("hidden"), "connect hint visible after selection");
    assert(hint.textContent.indexOf("0") !== -1, "hint names the selected node");

    // Tap node 1 → edge prompt opens (the tap-to-connect flow works end to end).
    tapAt(win, doc, 250, 100);
    assert(win.__weightModalOpened === true,
        "weight modal opens after tapping a second node");
    assert(doc.querySelectorAll(".node.node-selected").length === 0,
        "selection ring does not linger after connecting");

    win.close();
    console.log("UI Test 12 (touch tap-to-connect + hint) Succesful!");
}

function test_touch_long_press_delete() {
    const { doc, win, app, timers } = buildApp();
    loadMobile(win);

    clickCanvas(win, doc, 100, 100);   // node 0
    assert(app.graph.nodes.length === 1, "one node placed");

    const bubble = doc.querySelector(".node-delete-bubble");
    assert(bubble.classList.contains("hidden"), "bubble hidden before long-press");

    // Hold a finger on the node: touchstart arms the 600 ms long-press timer,
    // which is tracked by the fake timer queue.
    touchStartAt(win, doc, 100, 100);
    timers.fireNext();                  // 600 ms elapses while still holding
    assert(!bubble.classList.contains("hidden"), "delete bubble appears after a long-press");
    assert(bubble.textContent === "DELETE", "bubble says DELETE");

    // Lifting the finger must not dismiss the bubble (tap was consumed by the
    // long-press) — the user now taps the bubble to confirm.
    touchEndAt(win, doc, 100, 100);
    assert(!bubble.classList.contains("hidden"), "bubble survives finger lift");

    // Tapping the bubble confirms the deletion.
    bubble.dispatchEvent(new win.TouchEvent("touchend", {
        bubbles: true, cancelable: true, touches: [], changedTouches: [{ clientX: 0, clientY: 0 }]
    }));
    assert(app.graph.nodes.length === 0, "confirmed delete removes the node");
    assert(bubble.classList.contains("hidden"), "bubble hides after deleting");

    win.close();
    console.log("UI Test 13 (touch long-press delete) Succesful!");
}

function test_touch_node_drag() {
    const { doc, win, app } = buildApp();
    loadMobile(win);

    clickCanvas(win, doc, 100, 100);   // node 0
    const node0 = app.graph.nodes[0];
    assert(node0.x === 100 && node0.y === 100, "node placed at start position");

    // Finger down on the node, then move well past the tap slop.
    touchStartAt(win, doc, 100, 100);
    touchMoveTo(win, doc, 130, 120);   // ~36 px — past TAP_SLOP
    touchMoveTo(win, doc, 160, 150);
    assert(node0.x === 160 && node0.y === 150, "node follows the finger while dragging");
    assert(doc.querySelectorAll(".node.node-selected").length === 0,
        "a drag is not a selection");

    // Lifting the finger ends the drag without opening the weight modal.
    touchEndAt(win, doc, 160, 150);
    assert(win.__weightModalOpened === undefined || win.__weightModalOpened === false,
        "releasing a drag does not connect");

    // A drag onto an occupied spot is rejected: the node flashes red and stays
    // put, then returns to blue when the finger lifts — like the desktop drag.
    clickCanvas(win, doc, 300, 100);   // node 1 (far from node 0 at 160,150)
    assert(app.graph.nodes.length === 2, "second node placed");
    touchStartAt(win, doc, 160, 150);
    touchMoveTo(win, doc, 295, 100);   // ~5 px from node 1 — too close
    assert(node0.x === 160 && node0.y === 150, "rejected position does not move the node");
    const circle = doc.querySelectorAll(".node")[0].querySelector("circle");
    assert(circle.getAttribute("fill") === "#ef4444", "rejected touch position flashes red");
    touchEndAt(win, doc, 295, 100);
    assert(circle.getAttribute("fill") === "#3b82f6", "touch drag end restores the blue fill");

    win.close();
    console.log("UI Test 14 (touch node drag) Succesful!");
}


function test_desktop_drag_buttons() {
    const { doc, win, app } = buildApp();
    const container = doc.getElementById("graph-container");

    clickCanvas(win, doc, 100, 100);   // node 0
    const node0 = app.graph.nodes[0];
    assert(node0.x === 100 && node0.y === 100, "node placed at start position");

    // LEFT-drag on the node moves it (mousedown → mousemove → mouseup).
    doc.querySelector(".node").dispatchEvent(new win.MouseEvent("mousedown", {
        bubbles: true, cancelable: true, button: 0, clientX: 100, clientY: 100
    }));
    container.dispatchEvent(new win.MouseEvent("mousemove", {
        bubbles: true, cancelable: true, button: 0, clientX: 200, clientY: 150
    }));
    container.dispatchEvent(new win.MouseEvent("mouseup", {
        bubbles: true, cancelable: true, button: 0, clientX: 200, clientY: 150
    }));
    assert(node0.x === 200 && node0.y === 150, "left-drag repositions the node");
    assert(app.graph.nodes.length === 1, "drag on a node must not duplicate it");

    // The synthetic click after the drag must not plant a new node.
    clickCanvas(win, doc, 200, 150);
    assert(app.graph.nodes.length === 1, "trailing click after node drag adds nothing");

    // RIGHT-drag on the node must NOT move it (right button is edge/pan only).
    doc.querySelector(".node").dispatchEvent(new win.MouseEvent("mousedown", {
        bubbles: true, cancelable: true, button: 2, clientX: 200, clientY: 150
    }));
    container.dispatchEvent(new win.MouseEvent("mousemove", {
        bubbles: true, cancelable: true, button: 2, clientX: 260, clientY: 180
    }));
    container.dispatchEvent(new win.MouseEvent("mouseup", {
        bubbles: true, cancelable: true, button: 2, clientX: 260, clientY: 180
    }));
    assert(node0.x === 200 && node0.y === 150, "right-drag on a node leaves it put");

    // A left-drag on the EMPTY canvas no longer pans; it must also not add a
    // node when the trailing click fires.
    const nodeCount = app.graph.nodes.length;
    container.dispatchEvent(new win.MouseEvent("mousedown", {
        bubbles: true, cancelable: true, button: 0, clientX: 10, clientY: 10
    }));
    container.dispatchEvent(new win.MouseEvent("mousemove", {
        bubbles: true, cancelable: true, button: 0, clientX: 60, clientY: 60
    }));
    container.dispatchEvent(new win.MouseEvent("mouseup", {
        bubbles: true, cancelable: true, button: 0, clientX: 60, clientY: 60
    }));
    clickCanvas(win, doc, 60, 60);
    assert(app.graph.nodes.length === nodeCount, "left-drag on empty canvas adds no node");

    // FAST CLICKING: a press that wanders a few pixels during a quick click is
    // still a click (CLICK_SLOP), so rapid node creation keeps working.
    container.dispatchEvent(new win.MouseEvent("mousedown", {
        bubbles: true, cancelable: true, button: 0, clientX: 40, clientY: 200
    }));
    container.dispatchEvent(new win.MouseEvent("mousemove", {
        bubbles: true, cancelable: true, button: 0, clientX: 44, clientY: 203   // ~5 px jitter
    }));
    container.dispatchEvent(new win.MouseEvent("mouseup", {
        bubbles: true, cancelable: true, button: 0, clientX: 44, clientY: 203
    }));
    clickCanvas(win, doc, 44, 203);
    assert(app.graph.nodes.length === nodeCount + 1, "slight jitter during a click still adds a node");

    win.close();
    console.log("UI Test 15 (desktop drag buttons) Succesful!");
}

function test_desktop_drag_blocked_flash() {
    const { doc, win, app } = buildApp();
    const container = doc.getElementById("graph-container");

    clickCanvas(win, doc, 100, 100);   // node 0
    clickCanvas(win, doc, 200, 100);   // node 1 (100 px away — above MIN_DISTANCE)
    assert(app.graph.nodes.length === 2, "two nodes placed");
    const node0 = app.graph.nodes[0];

    // Left-drag node 0 onto node 1's position: MIN_DISTANCE rejects it and the
    // node flashes red instead of moving.
    doc.querySelector(".node").dispatchEvent(new win.MouseEvent("mousedown", {
        bubbles: true, cancelable: true, button: 0, clientX: 100, clientY: 100
    }));
    container.dispatchEvent(new win.MouseEvent("mousemove", {
        bubbles: true, cancelable: true, button: 0, clientX: 205, clientY: 100
    }));
    assert(node0.x === 100 && node0.y === 100, "node does not move into an occupied spot");
    const circle = doc.querySelector(".node").querySelector("circle");
    assert(circle.getAttribute("fill") === "#ef4444", "rejected position flashes the node red");

    // Releasing restores the normal fill.
    container.dispatchEvent(new win.MouseEvent("mouseup", {
        bubbles: true, cancelable: true, button: 0, clientX: 205, clientY: 100
    }));
    assert(circle.getAttribute("fill") === "#3b82f6", "drag end restores the blue fill");

    win.close();
    console.log("UI Test 16 (desktop drag blocked flash) Succesful!");
}

test_run_button_disabled_until_graph_has_nodes();
test_legend_and_mode_switch();
test_algo_switch_updates_label_and_hides_start_input();
test_enter_key_runs_algorithm();
test_speed_slider_scales_step_delay_live();
test_playback_bar_stays_after_completion();
test_result_panel_is_a_bottom_sheet_on_mobile();
test_viewport_group_and_zoom_setup();
test_help_modal_opens_and_closes();
test_pan_does_not_add_node();
test_mobile_script_loads_after_main();
test_touch_tap_to_connect_and_hint();
test_touch_long_press_delete();
test_touch_node_drag();
test_desktop_drag_buttons();
test_desktop_drag_blocked_flash();
