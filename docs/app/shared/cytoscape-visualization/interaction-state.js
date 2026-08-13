import { compactIriToCurie, namespacePrefixMapFromRegistry } from '../namespace-registry/index.js';
import { createDefaultGraphUiState, createGraphState } from './graph-state.js';
import { selectGraphElementIds } from './filter-visibility.js';

/**
 * Updates graph selection state for a node or edge interaction.
 *
 * @param {object} graphState
 * @param {{elementType: 'node'|'edge', elementId: string, ctrlKey?: boolean, metaKey?: boolean, shiftKey?: boolean}} action
 * @returns {object}
 */
export function updateGraphElementSelection(graphState, action) {
  const isNode = action.elementType === 'node';
  const orderedIds = isNode ? graphState.nodes.map((node) => node.id) : graphState.edges.map((edge) => edge.id);
  const currentSelectedIds = isNode ? graphState.ui?.selectedNodeIds : graphState.ui?.selectedEdgeIds;
  const selection = selectGraphElementIds(currentSelectedIds || [], orderedIds, action.elementId, {
    ctrlKey: action.ctrlKey,
    metaKey: action.metaKey,
    shiftKey: action.shiftKey,
    anchorId: graphState.ui?.selectionAnchorId || ''
  });

  return updateGraphUiState(graphState, {
    selectedNodeIds: isNode ? selection.selectedIds : [],
    selectedEdgeIds: isNode ? [] : selection.selectedIds,
    selectionAnchorId: selection.anchorId,
    activeInspectorTarget: Object.freeze({ elementType: action.elementType, elementId: action.elementId })
  });
}

/**
 * Clears all selected graph elements.
 *
 * @param {object} graphState
 * @returns {object}
 */
export function clearGraphElementSelection(graphState) {
  return updateGraphUiState(graphState, {
    selectedNodeIds: [],
    selectedEdgeIds: [],
    selectionAnchorId: '',
    activeInspectorTarget: null
  });
}

/**
 * Hides currently selected nodes and edges.
 *
 * @param {object} graphState
 * @returns {object}
 */
export function hideSelectedGraphElements(graphState) {
  return updateGraphUiState(graphState, {
    hiddenNodeIds: unique([...(graphState.ui?.hiddenNodeIds || []), ...(graphState.ui?.selectedNodeIds || [])]),
    hiddenEdgeIds: unique([...(graphState.ui?.hiddenEdgeIds || []), ...(graphState.ui?.selectedEdgeIds || [])]),
    selectedNodeIds: [],
    selectedEdgeIds: [],
    selectionAnchorId: '',
    activeInspectorTarget: null
  });
}

/**
 * Restores hidden graph elements.
 *
 * @param {object} graphState
 * @returns {object}
 */
export function restoreHiddenGraphElements(graphState) {
  return updateGraphUiState(graphState, {
    hiddenNodeIds: [],
    hiddenEdgeIds: []
  });
}

/**
 * Persists a manual node position in graph UI state.
 *
 * @param {object} graphState
 * @param {string} nodeId
 * @param {{x: number, y: number}} position
 * @returns {object}
 */
export function pinGraphNodePosition(graphState, nodeId, position) {
  return updateGraphUiState(graphState, {
    pinnedNodePositions: {
      ...(graphState.ui?.pinnedNodePositions || {}),
      [nodeId]: Object.freeze({ x: Number(position.x), y: Number(position.y) })
    }
  });
}

/**
 * Sets the active inspector target.
 *
 * @param {object} graphState
 * @param {{elementType: 'node'|'edge', elementId: string}|null} target
 * @returns {object}
 */
export function setGraphInspectorTarget(graphState, target) {
  return updateGraphUiState(graphState, {
    activeInspectorTarget: target ? Object.freeze({ ...target }) : null
  });
}

/**
 * Creates copyable strings for a selected Cytoscape element.
 *
 * @param {object} elementData
 * @param {{prefixes?: Record<string,string>}} [options]
 * @returns {{iri: string, curie: string, tripleId: string}}
 */
export function createGraphElementCopyPayload(elementData, options = {}) {
  const prefixes = options.prefixes || namespacePrefixMapFromRegistry();
  const iri = elementData?.iri || elementData?.predicateIri || '';
  const curie = iri ? compactIriToCurie(iri, prefixes) : { ok: false, value: '' };
  return Object.freeze({
    iri,
    curie: curie.ok ? curie.value : iri,
    tripleId: elementData?.quad ? elementData.id : ''
  });
}

function updateGraphUiState(graphState, uiPatch) {
  return createGraphState({
    nodes: graphState.nodes,
    edges: graphState.edges,
    quads: graphState.quads,
    ui: createDefaultGraphUiState({
      ...(graphState.ui || {}),
      ...uiPatch
    }),
    indexes: graphState.indexes,
    diagnostics: graphState.diagnostics
  });
}

function unique(values) {
  return Array.from(new Set(values || []));
}
