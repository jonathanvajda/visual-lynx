import { readFileAsText } from './shared/browser-file-io/index.js';
import {
  getSupportedMimeTypeForFilename,
  normalizeSupportedMimeType
} from './shared/format-registry/index.js';
import { parseRdfTextWithAdapters } from './shared/rdf-io/index.js';
import { renderStatusMessage } from './shared/ui-feedback/index.js';
import {
  createDefaultCytoscapeStylesheet,
  projectGraphStateToCytoscapeElements,
  projectRdfToGraphState
} from './shared/cytoscape-visualization/index.js';

const ui = {
  focusNode: document.getElementById('focusNodeInputBox'),
  fileInput: document.getElementById('graphFileInput'),
  inputFormat: document.getElementById('graphInputFormat'),
  loadExample: document.getElementById('loadBfoGraphDataBtn'),
  render: document.getElementById('renderBtn'),
  textInput: document.getElementById('rdfInput'),
  canvas: document.getElementById('cyGraph'),
  status: document.getElementById('cyStatus'),
  propertyBox: document.getElementById('propertyBox'),
  propertyContent: document.getElementById('propertyContent'),
  hideBlankNodes: document.getElementById('hideBNodes'),
  hideAxiomSupportNodes: document.getElementById('hideAxiomSupportNodes')
};

let cy = null;
let latestGraphState = null;

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
    layout: {
      name: 'cose',
      animate: false,
      fit: true,
      padding: 48,
      nodeDimensionsIncludeLabels: true
    },
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
}

function renderInspector(data) {
  if (!ui.propertyBox || !ui.propertyContent) return;
  const rows = [
    ['Kind', data.kind],
    ['Label', data.label],
    ['IRI', data.iri],
    ['Predicate', data.predicateIri],
    ['Graph', data.graphId]
  ].filter(([, value]) => value != null && value !== '');

  const annotations = Array.isArray(data.annotations) ? data.annotations : [];
  ui.propertyContent.replaceChildren(...rows.map(([label, value]) => propertyRow(label, value)));
  for (const annotation of annotations.slice(0, 40)) {
    ui.propertyContent.append(propertyRow(annotation.predicateLabel || annotation.predicateIri, annotation.value));
  }
  ui.propertyBox.style.display = 'block';
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
}

bindEvents();
setStatus('Load RDF or use the BFO example to render a Cytoscape graph.', 'info');
