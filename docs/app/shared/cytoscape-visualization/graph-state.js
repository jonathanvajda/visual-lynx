/**
 * Creates default renderer-independent graph UI state.
 *
 * @param {object} [overrides]
 * @returns {object}
 */
export function createDefaultGraphUiState(overrides = {}) {
  return Object.freeze({
    selectedNodeIds: Object.freeze(Array.from(overrides.selectedNodeIds || [])),
    selectedEdgeIds: Object.freeze(Array.from(overrides.selectedEdgeIds || [])),
    hiddenNodeIds: Object.freeze(Array.from(overrides.hiddenNodeIds || [])),
    hiddenEdgeIds: Object.freeze(Array.from(overrides.hiddenEdgeIds || [])),
    activeFilters: Object.freeze({
      hideBlankNodes: overrides.activeFilters?.hideBlankNodes !== false,
      hideAxiomSupportNodes: overrides.activeFilters?.hideAxiomSupportNodes !== false,
      visibleKinds: Object.freeze(Array.from(overrides.activeFilters?.visibleKinds || [])),
      visiblePredicates: Object.freeze(Array.from(overrides.activeFilters?.visiblePredicates || []))
    }),
    layoutName: overrides.layoutName || 'cose',
    layoutOptions: Object.freeze({ ...(overrides.layoutOptions || {}) }),
    pinnedNodePositions: Object.freeze({ ...(overrides.pinnedNodePositions || {}) }),
    activeInspectorTarget: overrides.activeInspectorTarget || null,
    pendingRdfEditDraft: overrides.pendingRdfEditDraft || null,
    pendingSparqlEditDraft: overrides.pendingSparqlEditDraft || null,
    activeAbstractionPolicy: overrides.activeAbstractionPolicy || null
  });
}

/**
 * @param {{nodes?: object[], edges?: object[], quads?: object[], ui?: object, indexes?: object, diagnostics?: object[]}} input
 * @returns {object}
 */
export function createGraphState(input = {}) {
  const nodes = Array.from(input.nodes || []);
  const edges = Array.from(input.edges || []);
  return Object.freeze({
    nodes: Object.freeze(nodes),
    edges: Object.freeze(edges),
    quads: Object.freeze(Array.from(input.quads || [])),
    ui: input.ui || createDefaultGraphUiState(),
    indexes: Object.freeze({
      nodesById: Object.freeze(Object.fromEntries(nodes.map((node) => [node.id, node]))),
      edgesById: Object.freeze(Object.fromEntries(edges.map((edge) => [edge.id, edge]))),
      ...(input.indexes || {})
    }),
    diagnostics: Object.freeze(Array.from(input.diagnostics || []))
  });
}
