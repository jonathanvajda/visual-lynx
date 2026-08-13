import { createDefaultGraphUiState, createGraphState } from './graph-state.js';

/**
 * Builds filter options from renderer-independent graph state.
 *
 * @param {object} graphState
 * @returns {{kinds: object[], predicates: object[], subjects: object[], objects: object[]}}
 */
export function buildGraphFilterOptionIndex(graphState) {
  const nodeCountsByKind = new Map();
  const predicateCountsByIri = new Map();
  const subjectCountsById = new Map();
  const objectCountsById = new Map();
  const nodesById = graphState.indexes?.nodesById || {};

  for (const node of graphState.nodes || []) {
    nodeCountsByKind.set(node.kind, (nodeCountsByKind.get(node.kind) || 0) + 1);
  }
  for (const edge of graphState.edges || []) {
    predicateCountsByIri.set(edge.predicateIri, (predicateCountsByIri.get(edge.predicateIri) || 0) + 1);
    subjectCountsById.set(edge.subjectId, (subjectCountsById.get(edge.subjectId) || 0) + 1);
    objectCountsById.set(edge.objectId, (objectCountsById.get(edge.objectId) || 0) + 1);
  }

  return Object.freeze({
    kinds: freezeOptions(Array.from(nodeCountsByKind, ([value, count]) => ({ value, label: value, count }))),
    predicates: freezeOptions(Array.from(predicateCountsByIri, ([value, count]) => ({ value, label: edgePredicateLabel(graphState, value), count }))),
    subjects: freezeOptions(Array.from(subjectCountsById, ([value, count]) => ({ value, label: nodesById[value]?.label || value, count }))),
    objects: freezeOptions(Array.from(objectCountsById, ([value, count]) => ({ value, label: nodesById[value]?.label || value, count })))
  });
}

/**
 * Calculates visible node and edge IDs from graph UI filter state.
 *
 * @param {object} graphState
 * @param {object} [filterOverrides]
 * @returns {{nodeIds: Set<string>, edgeIds: Set<string>}}
 */
export function calculateVisibleGraphElementIds(graphState, filterOverrides = {}) {
  const filters = {
    ...(graphState.ui?.activeFilters || {}),
    ...filterOverrides
  };
  const hiddenNodeIds = new Set(graphState.ui?.hiddenNodeIds || []);
  const hiddenEdgeIds = new Set(graphState.ui?.hiddenEdgeIds || []);
  const visibleKinds = new Set(filters.visibleKinds || []);
  const visiblePredicates = new Set(filters.visiblePredicates || []);
  const visibleSubjectIds = new Set(filters.visibleSubjectIds || []);
  const visibleObjectIds = new Set(filters.visibleObjectIds || []);

  const nodeIds = new Set((graphState.nodes || [])
    .filter((node) => !hiddenNodeIds.has(node.id))
    .filter((node) => !(filters.hideBlankNodes !== false && node.kind === 'blank-node'))
    .filter((node) => !(filters.hideAxiomSupportNodes !== false && node.kind === 'axiom-support'))
    .filter((node) => visibleKinds.size === 0 || visibleKinds.has(node.kind))
    .map((node) => node.id));

  const edgeIds = new Set((graphState.edges || [])
    .filter((edge) => !hiddenEdgeIds.has(edge.id))
    .filter((edge) => nodeIds.has(edge.subjectId) && nodeIds.has(edge.objectId))
    .filter((edge) => visiblePredicates.size === 0 || visiblePredicates.has(edge.predicateIri))
    .filter((edge) => visibleSubjectIds.size === 0 || visibleSubjectIds.has(edge.subjectId))
    .filter((edge) => visibleObjectIds.size === 0 || visibleObjectIds.has(edge.objectId))
    .map((edge) => edge.id));

  const edgeVisibleNodeIds = new Set();
  for (const edge of graphState.edges || []) {
    if (!edgeIds.has(edge.id)) continue;
    edgeVisibleNodeIds.add(edge.subjectId);
    edgeVisibleNodeIds.add(edge.objectId);
  }

  if (visiblePredicates.size || visibleSubjectIds.size || visibleObjectIds.size) {
    for (const nodeId of Array.from(nodeIds)) {
      if (!edgeVisibleNodeIds.has(nodeId)) nodeIds.delete(nodeId);
    }
  }

  return { nodeIds, edgeIds };
}

/**
 * Returns graph state with updated active filters.
 *
 * @param {object} graphState
 * @param {object} filterPatch
 * @returns {object}
 */
export function updateGraphVisibilityFilters(graphState, filterPatch) {
  const ui = createDefaultGraphUiState({
    ...graphState.ui,
    activeFilters: {
      ...(graphState.ui?.activeFilters || {}),
      ...filterPatch
    }
  });
  return createGraphState({
    nodes: graphState.nodes,
    edges: graphState.edges,
    quads: graphState.quads,
    ui,
    indexes: graphState.indexes,
    diagnostics: graphState.diagnostics
  });
}

/**
 * Builds counts and selected values for a filter panel.
 *
 * @param {object} graphState
 * @returns {object}
 */
export function buildGraphFilterPanelViewModel(graphState) {
  const options = buildGraphFilterOptionIndex(graphState);
  const visible = calculateVisibleGraphElementIds(graphState);
  return Object.freeze({
    options,
    selected: graphState.ui?.activeFilters || {},
    counts: Object.freeze({
      visibleNodes: visible.nodeIds.size,
      hiddenNodes: Math.max(0, (graphState.nodes || []).length - visible.nodeIds.size),
      visibleEdges: visible.edgeIds.size,
      hiddenEdges: Math.max(0, (graphState.edges || []).length - visible.edgeIds.size)
    })
  });
}

/**
 * Updates an ordered ID selection according to pointer modifier mode.
 *
 * @param {string[]} currentSelectedIds
 * @param {string[]} orderedIds
 * @param {string} targetId
 * @param {{ctrlKey?: boolean, metaKey?: boolean, shiftKey?: boolean, anchorId?: string}} [options]
 * @returns {{selectedIds: string[], anchorId: string}}
 */
export function selectGraphElementIds(currentSelectedIds, orderedIds, targetId, options = {}) {
  const current = new Set(currentSelectedIds || []);
  const ordered = Array.from(orderedIds || []);
  if (!targetId || !ordered.includes(targetId)) return { selectedIds: Array.from(current), anchorId: options.anchorId || '' };

  if (options.shiftKey && options.anchorId && ordered.includes(options.anchorId)) {
    const start = ordered.indexOf(options.anchorId);
    const end = ordered.indexOf(targetId);
    const [from, to] = start <= end ? [start, end] : [end, start];
    return {
      selectedIds: ordered.slice(from, to + 1),
      anchorId: options.anchorId
    };
  }

  if (options.ctrlKey || options.metaKey) {
    if (current.has(targetId)) current.delete(targetId);
    else current.add(targetId);
    return { selectedIds: ordered.filter((id) => current.has(id)), anchorId: targetId };
  }

  return { selectedIds: [targetId], anchorId: targetId };
}

function edgePredicateLabel(graphState, predicateIri) {
  const edge = (graphState.edges || []).find((candidate) => candidate.predicateIri === predicateIri);
  return graphState.indexes?.labelIndex?.get(edge?.predicateId)?.label || edge?.label || predicateIri;
}

function freezeOptions(options) {
  return Object.freeze(options
    .sort((left, right) => left.label.localeCompare(right.label))
    .map((option) => Object.freeze(option)));
}
