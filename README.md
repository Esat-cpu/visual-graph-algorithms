# Visual Graph Algorithms

An interactive graph algorithm visualizer built with Vanilla JS and D3.js.

---

## Algorithms

| Algorithm | Type | Description |
|-----------|------|-------------|
| **Dijkstra** | Shortest Path | Finds the shortest path from a source node to all other nodes |
| **Bellman-Ford** | Shortest Path | Handles negative edge weights and detects negative cycles |
| **Prim** | Minimum Spanning Tree | Builds an MST by greedily adding the cheapest edge from the visited set |
| **Kruskal** | Minimum Spanning Tree | Builds an MST by sorting all edges and adding them without creating cycles |

## Building a Graph

- **Left click** on the canvas to add a node
- **Right drag** from one node to another to add an edge (you'll be prompted for a weight)
- **Right drag** between two already-connected nodes to remove the edge
- **Right click** a node to remove it
- **Left drag** a node to reposition it

### Zoom & Pan

- **Mouse wheel** zooms in/out around the cursor.
- **Drag empty canvas space** pans the view (works on desktop with the mouse).
- **Pinch two fingers** zooms and pans on touch screens.
- Nodes and edges always stay on screen — zooming only changes the view, not the graph.

### Mobile / Touch Devices

On touch screens the interaction model changes to be safe and simple:

- **Tap** the canvas to add a node.
- **Tap a node, then tap another node** to connect them with an edge.
- Tapping an edge that already exists opens its weight dialog, which now also has a **REMOVE EDGE** button.
- **Long-press a node** (600 ms) until a red bubble appears, then confirm to delete it.
- Tapping empty canvas clears the current selection.
- **Pinch with two fingers** to zoom and pan the view.

### Graph Mode

- **UNDIRECTED** (default): an edge works both ways with a single weight.
- **DIRECTED**: drag from node A to node B to create an A→B edge. Each direction can have its own weight, so A→B and B→A can coexist. Edge direction is shown with an arrow.

### Running an Algorithm

1. Select an algorithm from the top bar
2. For Dijkstra, Bellman-Ford, and Prim — enter a start node ID
3. Click **RUN**
4. After the animation completes, click a node in the output panel to highlight its shortest path

> **Note:** Prim and Kruskal require a connected undirected graph.

### Playback Controls

While an algorithm animates, the top bar shows a **SPEED** slider (0.25×–8×, default 1×). It can be changed live — the new speed takes effect on the very next step.

A playback bar appears below the top bar while an animation runs and stays open afterwards so you can review and rewind:

- **⏪ REV** — play the animation backwards (toggle it again to play forward).
- **Scrubber** — drag to jump to any step, in either direction. Dragging to the far right finishes the animation instantly.
- The **RUN** button turns into **■ STOP** while an animation plays; click it to cancel.

Editing the graph, switching algorithm or mode, or clearing hides the playback bar and resets the session.

## Save and Load

- **⬇ EXPORT** saves the current graph to a JSON file on your computer (`graph-undirected.json` or `graph-directed.json`).
- **⬆ IMPORT** loads a graph from a JSON file. If that workspace already has a graph you'll be asked to confirm first, and if the file's mode differs from the active one the app switches to the matching workspace.

Files use the `vga` format: `{ format, version, directed, nodeIdCounter, nodes, edges }`.

## Running Locally

```bash
npm install        # install local dependencies (d3, bootstrap)
npm run serve      # start a local server at http://localhost:8000
```

Then open `http://localhost:8000` in your browser. Dependencies are served from `node_modules`, so the app works offline after `npm install`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm test` | Run all algorithm and UI tests |
| `npm run serve` | Start a local server at `http://localhost:8000` |
| `npm run check` | Syntax-check every JS file |

## Stack

- Vanilla JavaScript + D3.js v7
- Bootstrap 5.3
- JetBrains Mono & Inter (Google Fonts)
