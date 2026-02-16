// ./docs/app/jsonld-visualizer-core.js


let currentNodes = [];
let currentLinks = [];
let currentTransform = d3.zoomIdentity;


function measureText(text, fontSize = 12, fontFamily = 'sans-serif', maxWidth = 200) {
  const dummy = document.createElement("div");
  dummy.style.fontSize = fontSize + "px";
  dummy.style.fontFamily = fontFamily;
  dummy.style.position = "absolute";
  dummy.style.visibility = "hidden";
  dummy.style.whiteSpace = "nowrap";
  dummy.innerText = text;
  document.body.appendChild(dummy);
  const naturalWidth = dummy.scrollWidth;
  document.body.removeChild(dummy);
  return Math.min(naturalWidth, maxWidth);
}


function setupSVG(svgSelector) {
  const svg = d3.select(svgSelector);
  svg.attr("height", 600).attr("width", "100%");
  svg.selectAll("*").remove();
  svg.append("defs").html(`
    <marker id="arrow" viewBox="0 -5 10 10" refX="20" refY="0"
      markerWidth="6" markerHeight="6" orient="auto">
      <path d="M0,-5L10,0L0,5" fill="#999" />
    </marker>
  `);
  return svg;
}

function setupSimulation(nodes, links, width, height) {
  return d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id(d => d.id).distance(120).strength(1))
    .force("charge", d3.forceManyBody().strength(-300).distanceMax(300))
    .force("center", d3.forceCenter(width / 2, height / 2));
}

function renderLinks(layer, links) {
  layer.selectAll(".link")
    .data(links)
    .join("line")
    .attr("class", "link")
    .attr("marker-end", "url(#arrow)");
}

function renderLinkLabels(layer, links) {
  layer.selectAll(".label")
    .data(links)
    .join("text")
    .attr("class", "label")
    .text(d => d.label);
}

function renderNodes(layer, nodes, simulation, stateMap) {
  const nodeGroups = layer.selectAll(".node")
    .data(nodes, d => d.id)
    .join("g")
    .attr("class", "node")
    .call(drag(simulation));

  nodeGroups.each(function(d) {
    drawNode(d3.select(this), d, simulation, stateMap);
  });
}


function drawNode(group, d, simulation, stateMap) {
  group.selectAll("*").remove();

  const fontSize = 12, lineHeight = 1.2, maxWidth = 200, paddingX = 10, paddingY = 6;
if (d.collapsed === undefined) d.collapsed = true;
const collapsed = d.collapsed;

  // Measure natural width (no wrap)
  const dummy = document.createElement("div");
  dummy.style.fontSize = fontSize + "px";
  dummy.style.lineHeight = lineHeight + "em";
  dummy.style.visibility = "hidden";
  dummy.style.position = "absolute";
  dummy.style.whiteSpace = "nowrap";
  dummy.style.fontFamily = "sans-serif";
  dummy.innerText = d.name;
  document.body.appendChild(dummy);
  const naturalWidth = dummy.scrollWidth;
  document.body.removeChild(dummy);

let type = "Unknown";
if (Array.isArray(d.type)) {
  type = d.type.join(", ");
} else if (typeof d.type === "string") {
  type = d.type;
}
  const fitsOnOneLine = naturalWidth <= maxWidth;
  const contentWidth = Math.min(naturalWidth, maxWidth);

  // Measure full height with wrapping for expanded state
  const dummyWrap = document.createElement("div");
  dummyWrap.style.fontSize = fontSize + "px";
  dummyWrap.style.lineHeight = lineHeight + "em";
  dummyWrap.style.visibility = "hidden";
  dummyWrap.style.position = "absolute";
  dummyWrap.style.whiteSpace = "normal";
  dummyWrap.style.wordWrap = "break-word";
  dummyWrap.style.width = contentWidth + "px";
  dummyWrap.style.fontFamily = "sans-serif";
  dummyWrap.innerText = d.name;
  document.body.appendChild(dummyWrap);
  const fullHeight = dummyWrap.scrollHeight;
  document.body.removeChild(dummyWrap);

  const collapsedHeight = Math.ceil(fontSize * lineHeight);
  const width = contentWidth + paddingX;
  const height = (collapsed || fitsOnOneLine) ? collapsedHeight + paddingY : fullHeight + paddingY;
        // Color logic
function extractLocal(t) {
  if (!t) return "";
  return window.MyFunctions.extractLocalNameFromIRI_Batch([t])[0] || t;
}

function fillColor(type = "") {
  const localTypes = Array.isArray(type) ? type.map(extractLocal) : [extractLocal(type)];

  if (localTypes.includes("Ontology")) return "#FAD9DD";
  if (localTypes.includes("NamedIndividual")) return "#D8BFD8";
  if (localTypes.includes("Class")) return "#F5DE82";
  if (localTypes.includes("DataType")) return "#A9FFA9";
  if (localTypes.some(t => t.includes("Annotation"))) return "#FFC4A0";
  if (localTypes.includes("ObjectProperty")) return "#D9EDF7";

  return "#D4D4D4";
}

function strokeColor(type = "") {
  const localTypes = Array.isArray(type) ? type.map(extractLocal) : [extractLocal(type)];

  if (localTypes.includes("Ontology")) return "#7A353C";
  if (localTypes.includes("NamedIndividual")) return "#592559";
  if (localTypes.includes("Class")) return "#F4BD37";
  if (localTypes.includes("DataType")) return "#285528";
  if (localTypes.some(t => t.includes("Annotation"))) return "#FCA045";
  if (localTypes.includes("ObjectProperty")) return "#4682B4";

  return "#7F7F7F";
}

  // Draw background
  group.append("rect")
    .attr("width", width)
    .attr("height", height)
    .attr("rx", 10)
    .attr("ry", 10)
    .attr("fill", fillColor(type))
    .attr("stroke", strokeColor(type))
    .attr("stroke-width", 1.5);


  // Add text
  group.append("foreignObject")
    .attr("width", width)
    .attr("height", height)
    .append("xhtml:div")
    .style("font-size", fontSize + "px")
    .style("line-height", lineHeight)
    .style("width", contentWidth + "px")
    .style("height", (height - paddingY) + "px")
    .style("padding", (paddingY / 2) + "px " + (paddingX / 2) + "px")
    .style("overflow", "hidden")
    .style("white-space", collapsed ? "nowrap" : "normal")
    .style("text-overflow", collapsed && !fitsOnOneLine ? "ellipsis" : "clip")
    .text(d.name);

  // Click handler for long text and properties
group.style("cursor", "pointer");
group.select("foreignObject > div")
  .on("click", (event) => {
    event.stopPropagation();
    showPropertyBox(d);
    if (!fitsOnOneLine) {
      d.collapsed = !collapsed;
      drawNode(group, d, simulation, stateMap);
      simulation.alpha(0.001).restart();
    }
  })
  .on("dblclick", (event) => {
    event.stopPropagation();
    extendOneHop(d);
  })
  .on("contextmenu", (event) => {
    event.preventDefault();
    const confirmDelete = confirm(`Remove node "${d.name}" and all connected edges?`);
    if (!confirmDelete) return;

    currentNodes = currentNodes.filter(n => n.id !== d.id);
    currentLinks = currentLinks.filter(l =>
      (typeof l.source === 'object' ? l.source.id : l.source) !== d.id &&
      (typeof l.target === 'object' ? l.target.id : l.target) !== d.id
    );

    drawGraph();
  });

  d._boxWidth = width;
  d._boxHeight = height;
}


function drag(simulation) {
  function dragstarted(event) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    event.subject.fx = event.subject.x;
    event.subject.fy = event.subject.y;
  }

  function dragged(event) {
    event.subject.fx = event.x;
    event.subject.fy = event.y;
  }

  function dragended(event) {
    if (!event.active) simulation.alphaTarget(0);
    // Commented out to keep node fixed at new position
    // event.subject.fx = null;
    // event.subject.fy = null;
  }

  return d3.drag()
    .on("start", dragstarted)
    .on("drag", dragged)
    .on("end", dragended);
}

function renderGraph(graphData) {
  currentNodes = graphData.nodes;
  currentLinks = graphData.links;

  populateTypeFilter(currentNodes);
  populatePredicateFilter(currentLinks); // <== NEW
  drawGraph();
}

function populateTypeFilter(nodes) {
  const select = document.getElementById("typeFilter");

  // 🧠 Capture selected values
  const selected = Array.from(select.selectedOptions).map(o => o.value);

  const typeMap = new Map();
  nodes.forEach(n => {
    const types = Array.isArray(n.type)
      ? n.type
      : typeof n.type === "string" ? [n.type] : [];
    types.forEach(typeIRI => {
      if (!typeIRI) return;
      const localName = window.MyFunctions.extractLocalNameFromIRI_Batch([typeIRI])[0] || typeIRI;
      typeMap.set(typeIRI, localName);
    });
  });

  select.innerHTML = '';

  Array.from(typeMap.entries())
    .sort((a, b) => a[1].localeCompare(b[1]))
    .forEach(([fullIRI, localName]) => {
      const option = document.createElement("option");
      option.value = fullIRI;
      option.textContent = localName;

      // ✅ Reapply selection
      if (selected.includes(fullIRI)) {
        option.selected = true;
      }

      select.appendChild(option);
    });
}

function populatePredicateFilter(links) {
  const select = document.getElementById("predicateFilter");

  // 🧠 Capture selected values
  const selected = Array.from(select.selectedOptions).map(o => o.value);

  const labelSet = new Set();
  links.forEach(link => {
    if (Array.isArray(link.label)) {
      link.label.forEach(l => labelSet.add(l));
    } else if (link.label) {
      labelSet.add(link.label);
    }
  });

  select.innerHTML = '';

  Array.from(labelSet)
    .sort((a, b) => a.localeCompare(b))
    .forEach(label => {
      const option = document.createElement("option");
      option.value = label;
      option.textContent = label;

      // ✅ Reapply selection
      if (selected.includes(label)) {
        option.selected = true;
      }

      select.appendChild(option);
    });
}




function extendOneHop(node) {
  try {
    if (typeof node.id !== "string" || node.id.trim() === "") {
  console.warn("⚠️ extendOneHop() called with invalid node.id:", node.id);
  return;
}

    const fullGraph = JSON.parse(document.getElementById("jsonInput").value);
    alert("hopping");
    const newGraph = window.MyFunctions.generateEntityGraphFromRDFRepresentation(fullGraph, node.id, 1);

    // Find truly new nodes and links
    const newNodes = newGraph.nodes.filter(n => !currentNodes.some(cn => cn.id === n.id));
    const newLinks = newGraph.links.filter(l =>
      !currentLinks.some(cl =>
        (cl.source.id || cl.source) === (l.source.id || l.source) &&
        (cl.target.id || cl.target) === (l.target.id || l.target)
      )
    );

    // Merge and re-render
    currentNodes.push(...newNodes);
    currentLinks.push(...newLinks);

    drawGraph();
  } catch (e) {
    console.error("Failed to extend node:", e);
    alert("Error extending node: " + e.message);
  }
}


function drawGraph() {
  const svg = setupSVG("#graph");
  const width = svg.node().getBoundingClientRect().width;
  const height = +svg.attr("height");
  const zoomLayer = svg.append("g").attr("class", "zoom-layer");

  const zoom = d3.zoom()
    .scaleExtent([0.1, 4])
    .on("zoom", (event) => {
      currentTransform = event.transform;
      zoomLayer.attr("transform", event.transform);
    });

  svg.call(zoom);
  if (currentTransform) {
    svg.call(zoom.transform, currentTransform);
  }

  // ✅ FILTER SETUP
  const hideBNodes = document.getElementById("hideBNodes").checked;
  const hideAxioms = document.getElementById("hideAxioms").checked;

  // ✅ Handle multi-select
  const selectedOptions = Array.from(document.getElementById("typeFilter").selectedOptions);
  const selectedTypes = selectedOptions.map(opt => opt.value).filter(v => v);

  // ✅ FILTER NODES
  const visibleNodes = currentNodes.filter(n => {
    if (hideBNodes && n.id.startsWith("_:b")) return false;

    if (selectedTypes.length > 0) {
      const nodeTypes = typeof n.type === "string"
        ? n.type.split(",").map(t => t.trim())
        : (Array.isArray(n.type) ? n.type : []);
      const hasMatchingType = selectedTypes.some(t => nodeTypes.includes(t));
      if (!hasMatchingType) return false;
    }

    return true;
  });

  const visibleNodeIds = new Set(visibleNodes.map(n => n.id));

  // ✅ FILTER LINKS
  const axiomPredicates = [
    "disjointWith",
    "unionOf",
    "intersectionOf",
    "complementOf",
    "allValuesFrom",
    "someValuesFrom"
  ];

    const selectedPredicates = Array.from(document.getElementById("predicateFilter").selectedOptions)
    .map(opt => opt.value)
    .filter(v => v);

  const visibleLinks = currentLinks.filter(l => {
    const src = typeof l.source === "object" ? l.source.id : l.source;
    const tgt = typeof l.target === "object" ? l.target.id : l.target;
    if (!visibleNodeIds.has(src) || !visibleNodeIds.has(tgt)) return false;

    const label = Array.isArray(l.label) ? l.label[0] : l.label;
    if (hideAxioms && axiomPredicates.includes(label)) return false;

    if (selectedPredicates.length > 0 && !selectedPredicates.includes(label)) return false;

    return true;
  });

  // ✅ SETUP AND RENDER
  const simulation = setupSimulation(visibleNodes, visibleLinks, width, height);
  renderLinks(zoomLayer, visibleLinks);
  renderLinkLabels(zoomLayer, visibleLinks);
  renderNodes(zoomLayer, visibleNodes, simulation, new Map());

  simulation.on("tick", () => {
    zoomLayer.selectAll(".link")
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);

    zoomLayer.selectAll(".label")
      .attr("x", d => (d.source.x + d.target.x) / 2)
      .attr("y", d => (d.source.y + d.target.y) / 2);

    zoomLayer.selectAll(".node")
      .attr("transform", d => {
        const x = d.x - (d._boxWidth || 0) / 2;
        const y = d.y - (d._boxHeight || 0) / 2;
        return `translate(${x},${y})`;
      });
  });
}


function showPropertyBox(nodeData) {
  const propertyBox = d3.select("#propertyBox");
  const propertyContent = d3.select("#propertyContent");

  if (nodeData.properties && nodeData.properties.length > 0) {
    propertyContent.html("");
    nodeData.properties.forEach(prop => {
      propertyContent.append("p")
        .html(`<strong>${prop.property}:</strong> ${prop.value}`);
    });
    propertyBox.style("display", "block");
  } else {
    propertyBox.style("display", "none");
  }
}

function renderJsonLDGraph(jsonld, targetId = null, hopDepth = 3) {
  let graphData;
  try {
    console.log("generateEntityGraphFromRDFRepresentation() called with:", {
      jsonld, targetId, hopDepth
    });
    graphData = window.MyFunctions.generateEntityGraphFromRDFRepresentation(jsonld, targetId, hopDepth);
  } catch (e) {
    alert("Error converting JSON-LD to graph: " + e.message);
    return;
  }

  renderGraph(graphData);
}

function renderGraphFromTextarea() {{
    let jsonld;
    try {
      jsonld = JSON.parse(document.getElementById("jsonInput").value);
    } catch {
      alert("Invalid JSON");
      return;
    }

    const inputElement = document.getElementById("focusNodeInputBox");
    const input = inputElement.value;
    
    // Use the input value, defaulting to null (or empty string) if blank
    const targetId = input && input.trim() !== "" ? input.trim() : null;

    renderJsonLDGraph(jsonld, targetId);
  };
}


document.addEventListener("click", (event) => {
  const box = document.getElementById("propertyBox");
  if (!box.contains(event.target) && !event.target.closest(".node")) {
    box.style.display = "none";
  }

document.getElementById("hideBNodes").addEventListener("change", drawGraph);
document.getElementById("hideAxioms").addEventListener("change", drawGraph);
document.getElementById("typeFilter").addEventListener("change", drawGraph);
document.getElementById("predicateFilter").addEventListener("change", drawGraph);

// Function to add event listeners to a select element
function addHighlightOnBlur(selectId) {
  const selectElement = document.getElementById(selectId);

  selectElement.addEventListener('blur', function() {
    this.classList.add('not-focused');
  });

  selectElement.addEventListener('focus', function() {
    this.classList.remove('not-focused');
  });
}

// Add event listeners to both select elements
addHighlightOnBlur('typeFilter');
addHighlightOnBlur('predicateFilter');

});