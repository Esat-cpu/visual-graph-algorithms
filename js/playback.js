"use strict";


// Playback drives an animation step by step with a setTimeout chain instead of
// setInterval. Every step is a self-contained snapshot, so playing forward or
// backward is just stepping an index and re-rendering the same frame — the
// renderer never needs to know which direction we are going.
//
// Because the next tick is scheduled one at a time, the delay can be changed
// live (it simply applies to the next schedule), the playback can be stopped
// by cancelling the pending timer, and the position can be jumped anywhere
// with seek().
//
// The scheduler ({setTimeout, clearTimeout}) is injectable so tests can drive
// ticks deterministically without real timers.
class Playback {
    // scheduler is optional; defaults to the global timers.
    constructor(scheduler) {
        this.scheduler = scheduler || defaultScheduler();

        this.steps = [];        // precomputed animation trace
        this.tick = null;       // renderer for one step: (step, index) => void
        this.onDone = null;     // called when playback finishes: (direction) => void
        this.onPosition = null; // called whenever the position changes: (pos) => void

        // `index` is the next step to advance to; `position` is the step that
        // is currently shown. In the forward loop the render happens at index
        // and then index moves past it; in the reverse loop index moves back
        // first and then that frame is rendered.
        this.index = 0;
        this.position = -1;     // -1 = nothing rendered yet

        this.delay = 1000;      // ms between steps (base, see setDelay)
        this.direction = 1;     // 1 = forward, -1 = backward
        this.running = false;
        this.timer = null;
    }

    // Begin a fresh playback from step 0, playing forward.
    //   steps   — array of snapshots to animate
    //   tick    — per-step renderer (step, index) => void
    //   onDone  — completion callback (direction) => void; direction is 1 when
    //             the end of the trace was reached and -1 when the start was
    //             reached by playing backward.
    //   delay   — base delay between steps in ms
    start(steps, tick, onDone, delay) {
        this.stop();
        this.steps = steps;
        this.tick = tick;
        this.onDone = onDone;
        this.delay = delay;
        this.index = 0;
        this.position = -1;
        this.direction = 1;
        this.running = true;
        this.notifyPosition();
        this.scheduleNext();
    }

    // Resume playing from the current position in the current direction.
    // No-op when already running or when there is nothing to animate.
    play() {
        if (this.running || this.steps.length === 0) return;
        this.running = true;
        this.scheduleNext();
    }

    // Stop playback and cancel the pending tick. The current position is kept
    // so play() or seek() can resume from here.
    stop() {
        this.running = false;
        this.cancelTimer();
    }

    // Change the delay. Applies from the NEXT scheduled tick, so it is safe to
    // call while playback is running.
    setDelay(ms) {
        this.delay = ms;
    }

    // Change the playback direction (1 = forward, -1 = backward). Applies to
    // the next tick.
    setDirection(dir) {
        this.direction = dir === -1 ? -1 : 1;
    }

    // Jump to a given step index and render that frame immediately. Seeking to
    // the very end (steps.length) triggers the completion handler — this is
    // what makes "skip to end" work. Seeking stays within [0, steps.length].
    // If playback was running it resumes from the new position.
    seek(index) {
        if (this.steps.length === 0) return;
        const target = Math.max(0, Math.min(this.steps.length, index));
        this.cancelTimer();
        this.index = target;
        if (target === this.steps.length) {
            // Completed state — hand over to the completion renderer.
            this.running = false;
            this.position = target;
            if (this.onDone) this.onDone(this.direction);
        } else {
            this.position = target;
            if (this.tick) this.tick(this.steps[target], target);
        }
        this.notifyPosition();
        if (this.running) this.scheduleNext();
    }

    get total() {
        return this.steps.length;
    }

    // True when playback sits past the last step (the completed state).
    get atEnd() {
        return this.index >= this.steps.length;
    }

    // True when playback sits before the first step.
    get atStart() {
        return this.index <= 0;
    }

    // Schedule the next tick. If the boundary of the trace is reached in the
    // current direction, finish instead of scheduling.
    scheduleNext() {
        if (!this.running) return;
        if (this.direction === 1 && this.atEnd) return this.finish(1);
        if (this.direction === -1 && this.atStart) return this.finish(-1);
        this.timer = this.scheduler.setTimeout(() => this.tickOnce(), this.delay);
    }

    tickOnce() {
        this.timer = null;
        if (this.direction === 1) {
            const i = this.index;
            this.position = i;
            if (this.tick) this.tick(this.steps[i], i);
            this.index++;
        } else {
            this.index--;
            const i = this.index;
            this.position = i;
            if (this.tick) this.tick(this.steps[i], i);
        }
        this.notifyPosition();
        this.scheduleNext();
    }

    finish(dir) {
        this.running = false;
        this.position = dir === 1 ? this.steps.length : 0;
        if (this.onDone) this.onDone(dir);
        this.notifyPosition();
    }

    notifyPosition() {
        if (this.onPosition) this.onPosition(this.position);
    }

    cancelTimer() {
        if (this.timer != null) {
            this.scheduler.clearTimeout(this.timer);
            this.timer = null;
        }
    }
}


// Default scheduler — uses the ambient setTimeout/clearTimeout (resolved at
// call time, so tests that patch the global timer see their version).
function defaultScheduler() {
    return {
        setTimeout: (fn, ms) => setTimeout(fn, ms),
        clearTimeout: (id) => clearTimeout(id)
    };
}


if (typeof module !== 'undefined') module.exports = { Playback };
