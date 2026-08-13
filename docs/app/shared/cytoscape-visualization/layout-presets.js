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
      idealEdgeLength: 120,
      nodeRepulsion: 9000,
      edgeElasticity: 90,
      gravity: 0.18,
      numIter: 800
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
      idealEdgeLength: 180,
      nodeRepulsion: 14000,
      edgeElasticity: 70,
      gravity: 0.12,
      numIter: 1200
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
