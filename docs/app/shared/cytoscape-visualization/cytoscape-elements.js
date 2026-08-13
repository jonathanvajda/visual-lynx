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
        ...estimateNodeVisualDimensions(node.label),
        kind: node.kind,
        term: node.term,
        termType: node.termType,
        iri: node.iri,
        value: node.value,
        typeIris: node.typeIris,
        annotations: node.annotations,
        propertyRecord: graphState.indexes?.propertyIndex?.get(node.id) || null
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
        label: createEdgeLabel(edge, graphState),
        kind: edge.kind,
        subjectTerm: edge.quad?.subject || null,
        predicateTerm: edge.predicateTerm || null,
        objectTerm: edge.quad?.object || null,
        graphTerm: edge.quad?.graph || null,
        predicateIri: edge.predicateIri,
        graphId: edge.graphId,
        quad: edge.quad
      }
    }));

  return [...nodes, ...edges];
}

function createEdgeLabel(edge, graphState) {
  const predicateLabel = graphState.indexes?.labelIndex?.get(edge.predicateId)?.label;
  return predicateLabel || edge.label;
}

/**
 * Estimates stable node dimensions for wrapped Cytoscape labels.
 *
 * Cytoscape's `width: label` and `height: label` can under-size wrapped text in
 * dense ontology graphs. This helper keeps sizing deterministic and testable.
 *
 * @param {string} label
 * @param {{maxCharsPerLine?: number, fontSize?: number, minWidth?: number, maxWidth?: number, minHeight?: number, maxHeight?: number}} [options]
 * @returns {{visualWidth: number, visualHeight: number, textMaxWidth: number}}
 */
export function estimateNodeVisualDimensions(label, options = {}) {
  const maxCharsPerLine = options.maxCharsPerLine || 24;
  const fontSize = options.fontSize || 11;
  const charWidth = fontSize * 0.62;
  const lineHeight = Math.ceil(fontSize * 1.35);
  const minWidth = options.minWidth || 54;
  const maxWidth = options.maxWidth || 230;
  const minHeight = options.minHeight || 32;
  const maxHeight = options.maxHeight || 190;
  const horizontalPadding = 28;
  const verticalPadding = 22;
  const lines = wrapLabelText(String(label || ''), maxCharsPerLine);
  const longestLineLength = Math.max(1, ...lines.map((line) => line.length));
  const visualWidth = clamp(Math.ceil(longestLineLength * charWidth + horizontalPadding), minWidth, maxWidth);
  const visualHeight = clamp(Math.ceil(lines.length * lineHeight + verticalPadding), minHeight, maxHeight);

  return Object.freeze({
    visualWidth,
    visualHeight,
    textMaxWidth: Math.max(24, visualWidth - horizontalPadding)
  });
}

function wrapLabelText(label, maxCharsPerLine) {
  const sourceLines = label.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const wrapped = [];
  for (const sourceLine of sourceLines.length ? sourceLines : ['']) {
    let line = '';
    for (const word of sourceLine.split(/\s+/)) {
      if (word.length > maxCharsPerLine) {
        if (line) {
          wrapped.push(line);
          line = '';
        }
        wrapped.push(...chunkText(word, maxCharsPerLine));
      } else if (!line) {
        line = word;
      } else if (`${line} ${word}`.length <= maxCharsPerLine) {
        line = `${line} ${word}`;
      } else {
        wrapped.push(line);
        line = word;
      }
    }
    if (line) wrapped.push(line);
  }
  return wrapped.length ? wrapped : [''];
}

function chunkText(text, chunkSize) {
  const chunks = [];
  for (let index = 0; index < text.length; index += chunkSize) {
    chunks.push(text.slice(index, index + chunkSize));
  }
  return chunks;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
