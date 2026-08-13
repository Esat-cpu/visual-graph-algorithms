"use strict";


// Dijkstra finds the shortest path from startId to every other node.
// It requires non-negative edge weights; for negative weights use Bellman-Ford.
function dijkstra(graph, startId) {
    const steps = [];
    const parents = {};

    const distance = {};
    const visited = {};

    // parents[n] records the previous node on the shortest path to n
    graph.nodes.forEach(n => {
        parents[n.id] = null;
        distance[n.id] = Infinity;
    });
    distance[startId] = 0;

    steps.push({ current: null, distance: { ...distance }, visited: { ...visited } });
    let lastDistance = steps[0].distance;

    // Relaxing only the current node's edges needs an adjacency list. It is
    // built once, so each edge is inspected a constant number of times instead
    // of re-scanning the whole edge list on every iteration.
    const adj = new Map();
    graph.edges.forEach(e => {
        if (!adj.has(e.source)) adj.set(e.source, []);
        adj.get(e.source).push({ to: e.target, weight: e.weight });
        if (!graph.directed) {
            if (!adj.has(e.target)) adj.set(e.target, []);
            adj.get(e.target).push({ to: e.source, weight: e.weight });
        }
    });

    // The next node is picked with a binary heap instead of a linear scan over
    // the remaining nodes, bringing the total to O((V + E) log V).
    const heap = new MinHeap();
    graph.nodes.forEach(n => heap.push(n.id, distance[n.id]));

    while (heap.size() > 0) {
        // Pop the unvisited node with the smallest distance. Outdated entries
        // (a node already visited, or pushed before a later improvement) are
        // skipped — lazy deletion keeps the heap simple.
        let entry = heap.pop();
        while (visited[entry.id] || distance[entry.id] !== entry.dist) {
            if (heap.size() === 0) return { steps, parents };
            entry = heap.pop();
        }
        const current = entry.id;
        visited[current] = true;

        // Relax the outgoing edges of the current node
        let changed = false;
        const out = adj.get(current) || [];
        for (let k = 0; k < out.length; ++k) {
            const rel = out[k];
            const newDist = rel.weight + distance[current];
            if (newDist < distance[rel.to]) {
                distance[rel.to] = newDist;
                parents[rel.to] = current;
                heap.push(rel.to, newDist);
                changed = true;
            }
        }

        // Snapshot distances only when this node improved something; otherwise
        // reuse the previous snapshot — identical values, but no O(V) copy.
        if (changed) lastDistance = { ...distance };
        steps.push({ current, distance: lastDistance, visited: { ...visited } });
    }

    return { steps, parents };
}


// Min-heap of (id, distance) entries ordered by distance, ties by id so the
// visitation order stays deterministic. Entries are never removed when a
// distance improves; a fresh entry is pushed and the stale one is skipped when
// it pops (lazy deletion).
class MinHeap {
    constructor() {
        this.arr = [];
    }

    push(id, dist) {
        const arr = this.arr;
        arr.push({ id, dist });
        let i = arr.length - 1;
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (heapLess(arr[i], arr[p])) {
                const tmp = arr[i]; arr[i] = arr[p]; arr[p] = tmp;
                i = p;
            } else {
                break;
            }
        }
    }

    pop() {
        const arr = this.arr;
        if (arr.length === 0) return null;
        const top = arr[0];
        const last = arr.pop();
        if (arr.length > 0) {
            arr[0] = last;
            let i = 0;
            for (;;) {
                const l = 2 * i + 1;
                const r = l + 1;
                let m = i;
                if (l < arr.length && heapLess(arr[l], arr[m])) m = l;
                if (r < arr.length && heapLess(arr[r], arr[m])) m = r;
                if (m === i) break;
                const tmp = arr[i]; arr[i] = arr[m]; arr[m] = tmp;
                i = m;
            }
        }
        return top;
    }

    size() {
        return this.arr.length;
    }
}


function heapLess(a, b) {
    return a.dist < b.dist || (a.dist === b.dist && a.id < b.id);
}


if (typeof module !== 'undefined') module.exports = { dijkstra };
