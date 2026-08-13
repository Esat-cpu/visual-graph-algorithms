"use strict";

const { Playback } = require('../js/playback.js');
const assert = require('assert');


// A deterministic fake timer. Ticks are queued with setTimeout and only run
// when the test fires them, so a whole playback can be stepped through
// synchronously without waiting for real time.
function FakeScheduler() {
    const queue = [];
    let nextId = 1;

    return {
        queue,
        setTimeout(fn, ms) {
            const id = nextId++;
            queue.push({ id, fn, ms, fired: false });
            return id;
        },
        clearTimeout(id) {
            const item = queue.find(c => c.id === id);
            if (item) item.fired = true;
        },
        // Fire exactly one pending tick.
        fireNext() {
            const item = queue.find(c => !c.fired);
            if (!item) return null;
            item.fired = true;
            item.fn();
            return item;
        },
        // Fire every pending tick in order (runs the whole trace).
        fireAll() {
            let n = 0;
            while (this.fireNext()) n++;
            return n;
        },
        pending() {
            return queue.filter(c => !c.fired);
        },
        // Delay of the next scheduled tick (for live-speed assertions).
        nextDelay() {
            const item = queue.find(c => !c.fired);
            return item ? item.ms : null;
        }
    };
}


// Collects the arguments every onPosition call receives.
function makePositionRecorder(pb) {
    const seen = [];
    pb.onPosition = pos => seen.push(pos);
    return seen;
}


function test_forward_playback_ticks_and_finishes() {
    const sched = new FakeScheduler();
    const pb = new Playback(sched);
    const steps = [{ n: 0 }, { n: 1 }, { n: 2 }];

    const ticked = [];
    const doneCalls = [];
    pb.start(steps, (step, i) => ticked.push(i), dir => doneCalls.push(dir), 100);

    assert(pb.running === true, "playback starts running");
    assert.strictEqual(pb.total, 3, "step count is exposed");

    const fired = sched.fireAll();

    assert.deepStrictEqual(ticked, [0, 1, 2], "every step is rendered once, in order");
    assert.deepStrictEqual(doneCalls, [1], "completion fires once with direction 1");
    assert(pb.running === false, "playback stops after completion");
    assert(pb.atEnd === true, "completion leaves the index past the last step");
    assert(fired >= 3, "three ticks were scheduled");
    console.log("Playback Test 1 (forward) Succesful!");
}


function test_reverse_playback() {
    const sched = new FakeScheduler();
    const pb = new Playback(sched);
    const steps = [{ n: 0 }, { n: 1 }, { n: 2 }, { n: 3 }];

    const ticked = [];
    const doneCalls = [];
    pb.start(steps, (step, i) => ticked.push(i), dir => doneCalls.push(dir), 100);
    sched.fireAll();                       // forward to the end

    pb.setDirection(-1);
    pb.play();
    const backTicked = [];
    const prev = pb.tick;
    pb.tick = (step, i) => { backTicked.push(i); prev(step, i); };
    sched.fireAll();                       // rewind to the start

    assert.deepStrictEqual(backTicked, [3, 2, 1, 0], "reverse renders steps from last to first");
    assert.deepStrictEqual(doneCalls, [1, -1], "second completion reports direction -1");
    assert(pb.running === false, "stops after rewinding to the start");
    assert(pb.atStart === true, "rewound to before the first step");
    console.log("Playback Test 2 (reverse) Succesful!");
}


function test_live_speed_change_applies_to_next_tick() {
    const sched = new FakeScheduler();
    const pb = new Playback(sched);
    pb.start([{ n: 0 }, { n: 1 }, { n: 2 }], () => {}, () => {}, 100);

    assert.strictEqual(sched.nextDelay(), 100, "initial delay honoured");

    pb.setDelay(25);                       // speed up mid-playback
    assert.strictEqual(sched.nextDelay(), 100, "already-pending tick keeps its delay");
    sched.fireNext();
    assert.strictEqual(sched.nextDelay(), 25, "new delay applies to the tick after the pending one");

    sched.fireNext();
    assert.strictEqual(sched.nextDelay(), 25, "delay stays changed for later ticks");
    console.log("Playback Test 3 (live speed) Succesful!");
}


function test_stop_cancels_pending_tick() {
    const sched = new FakeScheduler();
    const pb = new Playback(sched);
    const ticked = [];
    pb.start([{ n: 0 }, { n: 1 }, { n: 2 }, { n: 3 }], (s, i) => ticked.push(i), () => {}, 100);

    sched.fireNext();
    sched.fireNext();

    pb.stop();
    assert(pb.running === false, "stop clears the running flag");
    assert(sched.pending().length === 0, "no tick remains scheduled after stop");

    sched.fireAll();
    assert.deepStrictEqual(ticked, [0, 1], "no further ticks after stop");
    console.log("Playback Test 4 (stop) Succesful!");
}


function test_seek_jumps_and_renders_immediately() {
    const sched = new FakeScheduler();
    const pb = new Playback(sched);
    const steps = [{ n: 0 }, { n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }];

    const rendered = [];
    pb.start(steps, (step, i) => rendered.push(i), () => {}, 100);
    sched.fireNext();
    sched.fireNext();                      // rendered 0, 1

    pb.seek(3);                            // jump to step 3

    assert.deepStrictEqual(rendered, [0, 1, 3], "seek renders the target step at once");
    assert.strictEqual(pb.position, 3, "position reflects the seek");
    assert(pb.running === true, "seeking does not stop a running playback");
    assert(sched.pending().length === 1, "a fresh tick is scheduled after seeking");
    console.log("Playback Test 5 (seek) Succesful!");
}


function test_seek_clamps_out_of_range() {
    const sched = new FakeScheduler();
    const pb = new Playback(sched);
    const rendered = [];
    pb.start([{ n: 0 }, { n: 1 }], (step, i) => rendered.push(i), () => {}, 100);

    pb.seek(-5);                           // below start
    assert.deepStrictEqual(rendered, [0], "negative seek clamps to step 0");
    assert.strictEqual(pb.position, 0, "position clamped to 0");

    rendered.length = 0;
    pb.seek(99);                           // beyond end → completed state
    assert.strictEqual(pb.position, 2, "position clamps to the step count");
    assert(pb.running === false, "seeking past the end completes the playback");
    assert(rendered.length === 0, "no step render when seeking to completion");
    console.log("Playback Test 6 (seek clamp) Succesful!");
}


function test_seek_to_end_fires_done() {
    const sched = new FakeScheduler();
    const pb = new Playback(sched);
    const doneCalls = [];
    pb.start([{ n: 0 }, { n: 1 }], () => {}, dir => doneCalls.push(dir), 100);

    pb.seek(2);                            // skip straight to the end
    assert.deepStrictEqual(doneCalls, [1], "seeking to the end triggers completion");
    assert(pb.atEnd === true, "position is the completed state");
    console.log("Playback Test 7 (seek to end) Succesful!");
}


function test_position_callback_reports_moves() {
    const sched = new FakeScheduler();
    const pb = new Playback(sched);
    const positions = makePositionRecorder(pb);

    pb.start([{ n: 0 }, { n: 1 }, { n: 2 }], () => {}, () => {}, 100);
    assert.deepStrictEqual(positions, [-1], "start reports nothing rendered yet");

    sched.fireNext();
    assert.strictEqual(pb.position, 0, "first step rendered");

    sched.fireNext();
    assert.strictEqual(pb.position, 1, "second step rendered");

    pb.seek(0);
    assert.strictEqual(pb.position, 0, "seek reports the new position");

    sched.fireAll();
    assert.strictEqual(pb.position, 3, "completion reports the far end");
    console.log("Playback Test 8 (position callback) Succesful!");
}


function test_play_resumes_from_stopped_position() {
    const sched = new FakeScheduler();
    const pb = new Playback(sched);
    const ticked = [];
    pb.start([{ n: 0 }, { n: 1 }, { n: 2 }], (s, i) => ticked.push(i), () => {}, 100);

    sched.fireNext();                      // rendered 0
    pb.stop();

    pb.setDirection(-1);                   // resume backwards from step 0
    pb.play();
    sched.fireAll();

    // position after rendering step 0 is 1; first backward tick goes to 0 and
    // renders steps[0] again, then playback is already at the start.
    assert.deepStrictEqual(ticked, [0, 0], "reverse from a stopped position rewinds");
    assert(pb.running === false, "finished rewinding to the start");
    console.log("Playback Test 9 (resume) Succesful!");
}


test_forward_playback_ticks_and_finishes();
test_reverse_playback();
test_live_speed_change_applies_to_next_tick();
test_stop_cancels_pending_tick();
test_seek_jumps_and_renders_immediately();
test_seek_clamps_out_of_range();
test_seek_to_end_fires_done();
test_position_callback_reports_moves();
test_play_resumes_from_stopped_position();
