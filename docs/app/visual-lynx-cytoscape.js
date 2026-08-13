import { readFileAsText } from './shared/browser-file-io/index.js';
import {
  getSupportedMimeTypeForFilename,
  normalizeSupportedMimeType
} from './shared/format-registry/index.js';
import { parseRdfTextWithAdapters } from './shared/rdf-io/index.js';
import { renderStatusMessage } from './shared/ui-feedback/index.js';
import {
  buildInspectorViewModel,
  calculateNeighborNudgePositions,
  createCytoscapeLayoutOptions,
  createDefaultCytoscapeStylesheet,
  getFirstDegreeNeighborNodeIds,
  projectGraphStateToCytoscapeElements,
  projectRdfToGraphState
} from './shared/cytoscape-visualization/index.js';

const ui = {
  focusNode: document.getElementById('focusNodeInputBox'),
  fileInput: document.getElementById('graphFileInput'),
  inputFormat: document.getElementById('graphInputFormat'),
  layoutPreset: document.getElementById('layoutPreset'),
  relayout: document.getElementById('relayoutBtn'),
  fitGraph: document.getElementById('fitGraphBtn'),
  loadExample: document.getElementById('loadBfoGraphDataBtn'),
  render: document.getElementById('renderBtn'),
  textInput: document.getElementById('rdfInput'),
  canvas: document.getElementById('cyGraph'),
  status: document.getElementById('cyStatus'),
  propertyBox: document.getElementById('propertyBox'),
  propertyContent: document.getElementById('propertyContent'),
  hideBlankNodes: document.getElementById('hideBNodes'),
  hideAxiomSupportNodes: document.getElementById('hideAxiomSupportNodes'),
  dragMovesNeighbors: document.getElementById('dragMovesNeighbors')
};

let cy = null;
let latestGraphState = null;
let activeDragNudge = null;

function setStatus(message, severity = 'info') {
  renderStatusMessage(ui.status, { message, severity }, { classPrefix: 'cy-status' });
}

function runtime() {
  return {
    N3: globalThis.N3,
    jsonld: globalThis.jsonld,
    $rdf: globalThis.$rdf
  };
}

function normalizeSelectedMime(value) {
  if (!value || value === 'auto') return '';
  const normalized = normalizeSupportedMimeType(value);
  return normalized.ok ? normalized.value.mimeType : value;
}

function resolveInputMime(file, selectedValue, text) {
  const selected = normalizeSelectedMime(selectedValue);
  if (selected) return selected;

  if (file?.name) {
    const detected = getSupportedMimeTypeForFilename(file.name);
    if (detected.ok && detected.value.category === 'rdf') return detected.value.mimeType;
  }

  const trimmed = String(text || '').trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'application/ld+json';
  if (trimmed.startsWith('<') && trimmed.includes('rdf:RDF')) return 'application/rdf+xml';
  return 'text/turtle';
}

async function readCurrentInput() {
  const file = ui.fileInput?.files?.[0] || null;
  const text = file ? await readFileAsText(file) : String(ui.textInput?.value || '');
  return {
    text,
    file,
    mimeType: resolveInputMime(file, ui.inputFormat?.value || 'auto', text)
  };
}

async function loadBfoExample() {
  setStatus('Loading BFO example...', 'busy');
  const response = await fetch('./data/bfo-json-ld.json');
  if (!response.ok) throw new Error(`Failed to load BFO example: ${response.status}`);
  ui.textInput.value = await response.text();
  if (ui.inputFormat) ui.inputFormat.value = 'application/ld+json';
  setStatus('BFO example loaded. Render when ready.', 'success');
}

async function renderGraphFromCurrentInput() {
  if (!globalThis.cytoscape) throw new Error('Cytoscape.js was not loaded.');

  setStatus('Parsing RDF...', 'busy');
  const input = await readCurrentInput();
  if (!input.text.trim()) {
    setStatus('Load a graph file or paste RDF before rendering.', 'warning');
    return;
  }

  const parsed = await parseRdfTextWithAdapters(input.text, {
    format: input.mimeType,
    runtime: runtime()
  });

  latestGraphState = projectRdfToGraphState(parsed.quads, {
    focusNodeIri: String(ui.focusNode?.value || '').trim(),
    renderLiteralsAsNodes: false,
    ui: {
      activeFilters: {
        hideBlankNodes: ui.hideBlankNodes?.checked !== false,
        hideAxiomSupportNodes: true
      }
    }
  });

  renderCurrentGraphState();
  setStatus(`Rendered ${latestGraphState.nodes.length} node(s), ${latestGraphState.edges.length} edge(s).`, 'success');
}

function readGraphFilterOptions() {
  return {
    hideBlankNodes: ui.hideBlankNodes?.checked !== false,
    hideAxiomSupportNodes: ui.hideAxiomSupportNodes?.checked !== false
  };
}

function renderCurrentGraphState() {
  if (!latestGraphState) return;
  renderCytoscape(projectGraphStateToCytoscapeElements(latestGraphState, readGraphFilterOptions()));
}

function renderCytoscape(elements) {
  if (cy) cy.destroy();
  cy = globalThis.cytoscape({
    container: ui.canvas,
    elements,
    style: createDefaultCytoscapeStylesheet(),
    layout: createCytoscapeLayoutOptions(ui.layoutPreset?.value || 'overview'),
    wheelSensitivity: 0.18
  });

  cy.on('tap', 'node', (event) => {
    renderInspector(event.target.data());
  });
  cy.on('tap', 'edge', (event) => {
    renderInspector(event.target.data());
  });
  cy.on('tap', (event) => {
    if (event.target === cy) clearInspector();
  });
  cy.on('mouseover', 'node, edge', (event) => {
    event.target.addClass('is-hovered');
  });
  cy.on('mouseout', 'node, edge', (event) => {
    event.target.removeClass('is-hovered');
  });
  cy.on('grab', 'node', startNeighborNudge);
  cy.on('drag', 'node', updateNeighborNudge);
  cy.on('free', 'node', stopNeighborNudge);
}

function startNeighborNudge(event) {
  if (!ui.dragMovesNeighbors?.checked || !latestGraphState) {
    activeDragNudge = null;
    return;
  }

  const draggedNode = event.target;
  const neighborIds = getFirstDegreeNeighborNodeIds(latestGraphState, draggedNode.id())
    .filter((nodeId) => cy.getElementById(nodeId).nonempty());
  activeDragNudge = {
    draggedNodeId: draggedNode.id(),
    draggedStartPosition: { ...draggedNode.position() },
    neighborStartPositionsById: new Map(neighborIds.map((nodeId) => {
      const neighbor = cy.getElementById(nodeId);
      return [nodeId, { ...neighbor.position() }];
    }))
  };
}

function updateNeighborNudge(event) {
  if (!activeDragNudge || event.target.id() !== activeDragNudge.draggedNodeId) return;

  const positionsById = calculateNeighborNudgePositions(
    activeDragNudge.draggedStartPosition,
    event.target.position(),
    activeDragNudge.neighborStartPositionsById,
    { strength: 0.35 }
  );

  cy.batch(() => {
    for (const [nodeId, position] of positionsById) {
      cy.getElementById(nodeId).position(position);
    }
  });
}

function stopNeighborNudge() {
  activeDragNudge = null;
}

function renderInspector(data) {
  if (!ui.propertyBox || !ui.propertyContent) return;
  const viewModel = buildInspectorViewModel(data, latestGraphState?.indexes?.propertyIndex);

  ui.propertyContent.replaceChildren(...viewModel.headingRows.map(([label, value]) => propertyRow(label, value)));
  for (const group of viewModel.groups) {
    ui.propertyContent.append(propertyGroupHeading(group.label));
    for (const row of group.rows.slice(0, 60)) {
      ui.propertyContent.append(propertyRow(row.predicateLabel || row.predicateIri || group.label, formatPropertyValue(row)));
    }
  }
  ui.propertyBox.style.display = 'block';
}

function propertyGroupHeading(label) {
  const heading = document.createElement('h4');
  heading.textContent = label;
  return heading;
}

function formatPropertyValue(row) {
  const suffixes = [
    row.language ? `@${row.language}` : '',
    row.datatypeIri ? `^^${row.datatypeIri}` : ''
  ].filter(Boolean);
  return suffixes.length ? `${row.value} ${suffixes.join(' ')}` : row.value;
}

function propertyRow(label, value) {
  const row = document.createElement('p');
  const strong = document.createElement('strong');
  strong.textContent = `${label}: `;
  const span = document.createElement('span');
  span.textContent = String(value ?? '');
  row.append(strong, span);
  return row;
}

function clearInspector() {
  if (!ui.propertyBox || !ui.propertyContent) return;
  ui.propertyContent.replaceChildren();
  ui.propertyBox.style.display = 'none';
}

function bindEvents() {
  ui.loadExample?.addEventListener('click', () => {
    loadBfoExample().catch((error) => setStatus(error.message || String(error), 'error'));
  });
  ui.render?.addEventListener('click', () => {
    renderGraphFromCurrentInput().catch((error) => {
      console.error('[visual-lynx-cytoscape] render failed', error);
      setStatus(error.message || String(error), 'error');
    });
  });
  ui.hideBlankNodes?.addEventListener('change', renderCurrentGraphState);
  ui.hideAxiomSupportNodes?.addEventListener('change', renderCurrentGraphState);
  ui.relayout?.addEventListener('click', runSelectedLayout);
  ui.fitGraph?.addEventListener('click', () => {
    if (cy) cy.fit(undefined, 48);
  });
}

function runSelectedLayout() {
  if (!cy) return;
  cy.layout(createCytoscapeLayoutOptions(ui.layoutPreset?.value || 'overview')).run();
}

bindEvents();
setStatus('Load RDF or use the BFO example to render a Cytoscape graph.', 'info');
