
const svg = d3.select("#graph");
const graph = new Graph();

graph.addNode(50, 50);


function render() {
    // Kenarları çiz
    svg.selectAll("line")
        .data(graph.edges)
        .join("line")
        .attr("x1", e => graph.getNode(e.source).x)
        .attr("y1", e => graph.getNode(e.source).y)
        .attr("x2", e => graph.getNode(e.target).x)
        .attr("y2", e => graph.getNode(e.target).y)
        .attr("stroke", "#aaaaaa")
        .attr("stroke-width", 2);

    // Node'ları çiz
    svg.selectAll("circle")
        .data(graph.nodes)
        .join("circle")
        .attr("cx", n => n.x)
        .attr("cy", n => n.y)
        .attr("r", 20)
        .attr("fill", "#4a9eff");
}


render();
