# Visual Graph Algorithms

An interactive graph algorithm visualizer built with Vanilla JS and D3.js.

![Prim's Algorithm](screenshots/prim_example.png)

---


## Algorithms

| Algorithm | Type | Description |
|-----------|------|-------------|
| **Dijkstra** | Shortest Path | Finds the shortest path from a source node to all other nodes |
| **Bellman-Ford** | Shortest Path | Handles negative edge weights and detects negative cycles |
| **Prim** | Minimum Spanning Tree | Builds an MST by greedily adding the cheapest edge from the visited set |
| **Kruskal** | Minimum Spanning Tree | Builds an MST by sorting all edges and adding them without creating cycles |

## Usage

### Building a Graph
- **Left click** on the canvas to add a node
- **Right drag** from one node to another to add an edge (you'll be prompted for a weight)
- **Right drag** between two already-connected nodes to remove the edge
- **Right click** a node to remove it
- **Left drag** a node to reposition it

### Graph Mode
- **UNDIRECTED** (default): an edge works both ways with a single weight.
- **DIRECTED**: drag from node A to node B to create an A→B edge. Each direction can have its own weight, so A→B and B→A can coexist. Edge direction is shown with an arrow.

### Running an Algorithm
1. Select an algorithm from the top bar
2. For Dijkstra, Bellman-Ford, and Prim — enter a start node ID
3. Click **RUN**
4. After the animation completes, click a node in the output panel to highlight its shortest path

> **Note:** Prim and Kruskal require a connected undirected graph.

## Running Locally

```bash
npm install        # install local dependencies (d3, bootstrap)
npm run serve      # start a local server at http://localhost:8000
```

Then open `http://localhost:8000` in your browser. Dependencies are served from `node_modules`, so the app works offline after `npm install`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm test` | Run all algorithm tests |
| `npm run serve` | Start a local server at `http://localhost:8000` |
| `npm run check` | Syntax-check every JS file |


## Stack

- Vanilla JavaScript + D3.js v7
- Bootstrap 5.3
- JetBrains Mono & Inter (Google Fonts)
