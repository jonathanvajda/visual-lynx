import { calculateVisibleGraphElementIds } from './filter-visibility.js';

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
  const visible = calculateVisibleGraphElementIds(graphState, { hideBlankNodes, hideAxiomSupportNodes });
  const selectedNodeIds = new Set(graphState.ui?.selectedNodeIds || []);
  const selectedEdgeIds = new Set(graphState.ui?.selectedEdgeIds || []);

  const nodes = graphState.nodes
    .filter((node) => visible.nodeIds.has(node.id))
    .map((node) => {
      const pinnedPosition = graphState.ui?.pinnedNodePositions?.[node.id] || null;
      return {
        group: 'nodes',
        selected: selectedNodeIds.has(node.id),
        ...(pinnedPosition ? { position: pinnedPosition } : {}),
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
      };
    });

  const visibleEdges = graphState.edges
    .filter((edge) => visible.edgeIds.has(edge.id));
  const edgeRoutingById = buildEdgeRoutingIndex(visibleEdges);
  const edges = visibleEdges
    .map((edge) => ({
      group: 'edges',
      selected: selectedEdgeIds.has(edge.id),
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
        quad: edge.quad,
        ...edgeRoutingById.get(edge.id)
      }
    }));

  return [...nodes, ...edges];
}

function createEdgeLabel(edge, graphState) {
  const predicateLabel = graphState.indexes?.labelIndex?.get(edge.predicateId)?.label;
  return predicateLabel || edge.label;
}

/**
 * Builds deterministic routing metadata for visible Cytoscape edges.
 *
 * Parallel directed edges get symmetric control-point offsets. Self-loops get
 * stable loop directions and sweeps so multiple self-loops fan out.
 *
 * @param {object[]} edges
 * @returns {Map<string, {parallelEdgeIndex: number, parallelEdgeCount: number, controlPointDistance: number, loopDirection: string, loopSweep: string}>}
 */
export function buildEdgeRoutingIndex(edges) {
  const groups = new Map();
  for (const edge of edges || []) {
    const key = edge.subjectId === edge.objectId
      ? `loop:${edge.subjectId}`
      : `pair:${edge.subjectId}->${edge.objectId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(edge);
  }

  const routingById = new Map();
  for (const group of groups.values()) {
    group.sort((left, right) => left.id.localeCompare(right.id));
    const count = group.length;
    for (let index = 0; index < group.length; index += 1) {
      const edge = group[index];
      const offset = index - (count - 1) / 2;
      routingById.set(edge.id, Object.freeze({
        parallelEdgeIndex: index,
        parallelEdgeCount: count,
        controlPointDistance: edge.subjectId === edge.objectId ? 48 + index * 14 : Math.round(offset * 38),
        loopDirection: `${-45 + index * 28}deg`,
        loopSweep: `${60 + Math.min(index, 4) * 12}deg`
      }));
    }
  }
  return routingById;
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
