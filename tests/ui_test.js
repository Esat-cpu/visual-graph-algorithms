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
            return behavior;
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


test_run_button_disabled_until_graph_has_nodes();
test_legend_and_mode_switch();
test_algo_switch_updates_label_and_hides_start_input();
test_enter_key_runs_algorithm();
test_speed_slider_scales_step_delay_live();
test_playback_bar_stays_after_completion();
