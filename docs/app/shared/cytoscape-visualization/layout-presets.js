export const CYTOSCAPE_LAYOUT_PRESETS = Object.freeze({
  overview: Object.freeze({
    key: 'overview',
    label: 'Overview',
    options: Object.freeze({
      name: 'cose',
      animate: false,
      fit: true,
      padding: 64,
      nodeDimensionsIncludeLabels: true,
      randomize: false,
      idealEdgeLength: 170,
      nodeRepulsion: 18000,
      edgeElasticity: 60,
      gravity: 0.07,
      nodeOverlap: 80,
      componentSpacing: 160,
      numIter: 1000
    })
  }),
  wide: Object.freeze({
    key: 'wide',
    label: 'Wide',
    options: Object.freeze({
      name: 'cose',
      animate: false,
      fit: true,
      padding: 80,
      nodeDimensionsIncludeLabels: true,
      randomize: false,
      idealEdgeLength: 240,
      nodeRepulsion: 28000,
      edgeElasticity: 40,
      gravity: 0.04,
      nodeOverlap: 110,
      componentSpacing: 220,
      numIter: 1400
    })
  }),
  readable: Object.freeze({
    key: 'readable',
    label: 'Readable',
    options: Object.freeze({
      name: 'cose',
      animate: false,
      fit: true,
      padding: 72,
      nodeDimensionsIncludeLabels: true,
      randomize: false,
      idealEdgeLength: 220,
      nodeRepulsion: 24000,
      edgeElasticity: 50,
      gravity: 0.05,
      nodeOverlap: 100,
      componentSpacing: 200,
      numIter: 1500
    })
  }),
  compact: Object.freeze({
    key: 'compact',
    label: 'Compact',
    options: Object.freeze({
      name: 'cose',
      animate: false,
      fit: true,
      padding: 48,
      nodeDimensionsIncludeLabels: true,
      randomize: false,
      idealEdgeLength: 90,
      nodeRepulsion: 6000,
      edgeElasticity: 120,
      gravity: 0.28,
      numIter: 500
    })
  }),
  grid: Object.freeze({
    key: 'grid',
    label: 'Grid',
    options: Object.freeze({
      name: 'grid',
      animate: false,
      fit: true,
      padding: 48,
      avoidOverlap: true,
      avoidOverlapPadding: 20
    })
  }),
  breadthfirst: Object.freeze({
    key: 'breadthfirst',
    label: 'Hierarchy',
    options: Object.freeze({
      name: 'breadthfirst',
      animate: false,
      fit: true,
      padding: 64,
      directed: true,
      circle: false,
      grid: false,
      spacingFactor: 1.55,
      avoidOverlap: true
    })
  })
});

/**
 * Returns a Cytoscape layout preset by key.
 *
 * @param {string} key
 * @returns {{key: string, label: string, options: object}}
 */
export function getCytoscapeLayoutPreset(key) {
  return CYTOSCAPE_LAYOUT_PRESETS[key] || CYTOSCAPE_LAYOUT_PRESETS.overview;
}

/**
 * Returns fresh Cytoscape layout options for a preset.
 *
 * @param {string} key
 * @param {object} [overrides]
 * @returns {object}
 */
export function createCytoscapeLayoutOptions(key, overrides = {}) {
  return {
    ...getCytoscapeLayoutPreset(key).options,
    ...overrides
  };
}

/**
 * Builds option rows for a layout selector.
 *
 * @returns {Array<{value: string, label: string}>}
 */
export function listCytoscapeLayoutOptions() {
  return Object.values(CYTOSCAPE_LAYOUT_PRESETS).map((preset) => Object.freeze({
    value: preset.key,
    label: preset.label
  }));
}
