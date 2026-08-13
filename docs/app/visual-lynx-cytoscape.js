import { readFileAsText } from './shared/browser-file-io/index.js';
import {
  getSupportedMimeTypeForFilename,
  normalizeSupportedMimeType
} from './shared/format-registry/index.js';
import { parseRdfTextWithAdapters } from './shared/rdf-io/index.js';
import { renderStatusMessage } from './shared/ui-feedback/index.js';
import {
  buildInspectorViewModel,
  buildGraphFilterPanelViewModel,
  calculateNeighborNudgePositions,
  clearGraphElementSelection,
  createCytoscapeLayoutOptions,
  createDefaultCytoscapeStylesheet,
  createGraphElementCopyPayload,
  getFirstDegreeNeighborNodeIds,
  hideSelectedGraphElements,
  pinGraphNodePosition,
  projectGraphStateToCytoscapeElements,
  projectRdfToGraphState,
  restoreHiddenGraphElements,
  setGraphInspectorTarget,
  updateGraphElementSelection,
  updateGraphVisibilityFilters
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
  filterCounts: document.getElementById('filterCounts'),
  hideBlankNodes: document.getElementById('hideBNodes'),
  hideAxiomSupportNodes: document.getElementById('hideAxiomSupportNodes'),
  dragMovesNeighbors: document.getElementById('dragMovesNeighbors'),
  nodeKindFilter: document.getElementById('nodeKindFilter'),
  predicateFilter: document.getElementById('predicateFilter'),
  subjectFilter: document.getElementById('subjectFilter'),
  objectFilter: document.getElementById('objectFilter'),
  resetFilters: document.getElementById('resetFiltersBtn'),
  showAll: document.getElementById('showAllBtn'),
  hideSelected: document.getElementById('hideSelectedBtn'),
  restoreHidden: document.getElementById('restoreHiddenBtn'),
  copyIri: document.getElementById('copyIriBtn'),
  copyCurie: document.getElementById('copyCurieBtn'),
  copyTripleId: document.getElementById('copyTripleIdBtn')
};

let cy = null;
let latestGraphState = null;
let activeDragNudge = null;
let activeDraggedNodeId = '';
let latestInspectorData = null;

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
  renderFilterPanel();
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
  renderFilterPanel();
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

  cy.on('tap', 'node', handleGraphElementTap);
  cy.on('tap', 'edge', handleGraphElementTap);
  cy.on('tap', (event) => {
    if (event.target === cy) {
      latestGraphState = clearGraphElementSelection(latestGraphState);
      syncSelectedGraphElements();
      clearInspector();
    }
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
  activeDraggedNodeId = event.target.id();
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
  if (latestGraphState && activeDraggedNodeId && cy) {
    latestGraphState = pinGraphNodePosition(
      latestGraphState,
      activeDraggedNodeId,
      cy.getElementById(activeDraggedNodeId).position()
    );
  }
  activeDragNudge = null;
  activeDraggedNodeId = '';
}

function handleGraphElementTap(event) {
  if (!latestGraphState) return;
  const elementType = event.target.isNode() ? 'node' : 'edge';
  latestGraphState = updateGraphElementSelection(latestGraphState, {
    elementType,
    elementId: event.target.id(),
    ctrlKey: event.originalEvent?.ctrlKey,
    metaKey: event.originalEvent?.metaKey,
    shiftKey: event.originalEvent?.shiftKey
  });
  syncSelectedGraphElements();
  renderInspector(event.target.data());
}

function syncSelectedGraphElements() {
  if (!cy || !latestGraphState) return;
  cy.$(':selected').unselect();
  for (const nodeId of latestGraphState.ui.selectedNodeIds || []) {
    cy.getElementById(nodeId).select();
  }
  for (const edgeId of latestGraphState.ui.selectedEdgeIds || []) {
    cy.getElementById(edgeId).select();
  }
}

function renderInspector(data) {
  if (!ui.propertyBox || !ui.propertyContent) return;
  latestInspectorData = data;
  const viewModel = buildInspectorViewModel(data, latestGraphState?.indexes?.propertyIndex);
  latestGraphState = latestGraphState
    ? setGraphInspectorTarget(latestGraphState, { elementType: data.source && data.target ? 'edge' : 'node', elementId: data.id })
    : latestGraphState;

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
  latestInspectorData = null;
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
  ui.hideBlankNodes?.addEventListener('change', applyFilterControlState);
  ui.hideAxiomSupportNodes?.addEventListener('change', applyFilterControlState);
  ui.nodeKindFilter?.addEventListener('change', applyFilterControlState);
  ui.predicateFilter?.addEventListener('change', applyFilterControlState);
  ui.subjectFilter?.addEventListener('change', applyFilterControlState);
  ui.objectFilter?.addEventListener('change', applyFilterControlState);
  ui.resetFilters?.addEventListener('click', resetFilters);
  ui.showAll?.addEventListener('click', showAllFilters);
  ui.hideSelected?.addEventListener('click', hideSelectedElements);
  ui.restoreHidden?.addEventListener('click', restoreHiddenElements);
  ui.copyIri?.addEventListener('click', () => copyInspectorValue('iri'));
  ui.copyCurie?.addEventListener('click', () => copyInspectorValue('curie'));
  ui.copyTripleId?.addEventListener('click', () => copyInspectorValue('tripleId'));
  ui.relayout?.addEventListener('click', runSelectedLayout);
  ui.fitGraph?.addEventListener('click', () => {
    if (cy) cy.fit(undefined, 48);
  });
}

function hideSelectedElements() {
  if (!latestGraphState) return;
  latestGraphState = hideSelectedGraphElements(latestGraphState);
  clearInspector();
  renderCurrentGraphState();
}

function restoreHiddenElements() {
  if (!latestGraphState) return;
  latestGraphState = restoreHiddenGraphElements(latestGraphState);
  renderCurrentGraphState();
}

async function copyInspectorValue(key) {
  if (!latestInspectorData) return;
  const payload = createGraphElementCopyPayload(latestInspectorData);
  const value = payload[key] || '';
  if (!value) return;
  try {
    await navigator.clipboard?.writeText(value);
    setStatus(`Copied ${key}.`, 'success');
  } catch (error) {
    console.warn('[visual-lynx-cytoscape] clipboard write failed', error);
    setStatus(`Copy failed: ${value}`, 'warning');
  }
}

function applyFilterControlState() {
  if (!latestGraphState) return;
  latestGraphState = updateGraphVisibilityFilters(latestGraphState, {
    hideBlankNodes: ui.hideBlankNodes?.checked !== false,
    hideAxiomSupportNodes: ui.hideAxiomSupportNodes?.checked !== false,
    visibleKinds: readSelectedOptions(ui.nodeKindFilter),
    visiblePredicates: readSelectedOptions(ui.predicateFilter),
    visibleSubjectIds: readSelectedOptions(ui.subjectFilter),
    visibleObjectIds: readSelectedOptions(ui.objectFilter)
  });
  renderCurrentGraphState();
}

function resetFilters() {
  if (!latestGraphState) return;
  if (ui.hideBlankNodes) ui.hideBlankNodes.checked = true;
  if (ui.hideAxiomSupportNodes) ui.hideAxiomSupportNodes.checked = true;
  clearSelect(ui.nodeKindFilter);
  clearSelect(ui.predicateFilter);
  clearSelect(ui.subjectFilter);
  clearSelect(ui.objectFilter);
  applyFilterControlState();
}

function showAllFilters() {
  if (!latestGraphState) return;
  if (ui.hideBlankNodes) ui.hideBlankNodes.checked = false;
  if (ui.hideAxiomSupportNodes) ui.hideAxiomSupportNodes.checked = false;
  clearSelect(ui.nodeKindFilter);
  clearSelect(ui.predicateFilter);
  clearSelect(ui.subjectFilter);
  clearSelect(ui.objectFilter);
  applyFilterControlState();
}

function renderFilterPanel() {
  if (!latestGraphState) return;
  const viewModel = buildGraphFilterPanelViewModel(latestGraphState);
  writeFilterCounts(viewModel.counts);
  writeSelectOptions(ui.nodeKindFilter, viewModel.options.kinds, viewModel.selected.visibleKinds);
  writeSelectOptions(ui.predicateFilter, viewModel.options.predicates, viewModel.selected.visiblePredicates);
  writeSelectOptions(ui.subjectFilter, viewModel.options.subjects, viewModel.selected.visibleSubjectIds);
  writeSelectOptions(ui.objectFilter, viewModel.options.objects, viewModel.selected.visibleObjectIds);
}

function writeFilterCounts(counts) {
  if (!ui.filterCounts) return;
  ui.filterCounts.textContent = `${counts.visibleNodes}/${counts.visibleNodes + counts.hiddenNodes} node(s), ${counts.visibleEdges}/${counts.visibleEdges + counts.hiddenEdges} edge(s) visible`;
}

function writeSelectOptions(select, options, selectedValues = []) {
  if (!select) return;
  const selected = new Set(selectedValues || []);
  select.replaceChildren(...options.map((option) => {
    const element = document.createElement('option');
    element.value = option.value;
    element.textContent = `${option.label} (${option.count})`;
    element.selected = selected.has(option.value);
    return element;
  }));
}

function readSelectedOptions(select) {
  return Array.from(select?.selectedOptions || []).map((option) => option.value);
}

function clearSelect(select) {
  for (const option of Array.from(select?.options || [])) {
    option.selected = false;
  }
}

function runSelectedLayout() {
  if (!cy) return;
  cy.layout(createCytoscapeLayoutOptions(ui.layoutPreset?.value || 'overview')).run();
}

bindEvents();
setStatus('Load RDF or use the BFO example to render a Cytoscape graph.', 'info');
