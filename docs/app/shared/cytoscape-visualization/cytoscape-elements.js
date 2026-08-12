/**
 * Projects graph state into Cytoscape element JSON.
 *
 * @param {object} graphState
 * @param {{hideBlankNodes?: boolean, hideAxiomSupportNodes?: boolean}} [options]
 * @returns {Array<{group: 'nodes'|'edges', data: object}>}
 */
export function projectGraphStateToCytoscapeElements(graphState, options = {}) {
  const hideBlankNodes = options.hideBlankNodes ?? graphState.ui?.activeFilters?.hideBlankNodes ?? true;
  const hideAxiomSupportNodes = options.hideAxiomSupportNodes ?? graphState.ui?.activeFilters?.hideAxiomSupportNodes ?? true;
  const hiddenNodeIds = new Set(graphState.ui?.hiddenNodeIds || []);
  const hiddenEdgeIds = new Set(graphState.ui?.hiddenEdgeIds || []);

  const nodes = graphState.nodes
    .filter((node) => !hiddenNodeIds.has(node.id))
    .filter((node) => !(hideBlankNodes && node.kind === 'blank-node'))
    .filter((node) => !(hideAxiomSupportNodes && node.kind === 'axiom-support'))
    .map((node) => ({
      group: 'nodes',
      data: {
        id: node.id,
        label: node.label,
        kind: node.kind,
        termType: node.termType,
        iri: node.iri,
        value: node.value,
        typeIris: node.typeIris,
        annotations: node.annotations
      }
    }));

  const visibleNodeIds = new Set(nodes.map((node) => node.data.id));
  const edges = graphState.edges
    .filter((edge) => !hiddenEdgeIds.has(edge.id))
    .filter((edge) => visibleNodeIds.has(edge.subjectId) && visibleNodeIds.has(edge.objectId))
    .map((edge) => ({
      group: 'edges',
      data: {
        id: edge.id,
        source: edge.subjectId,
        target: edge.objectId,
        label: edge.label,
        kind: edge.kind,
        predicateIri: edge.predicateIri,
        graphId: edge.graphId
      }
    }));

  return [...nodes, ...edges];
}
