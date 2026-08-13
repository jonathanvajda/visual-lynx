import {
  createDefaultCytoscapeStylesheet
} from '../docs/app/shared/cytoscape-visualization/index.js';

describe('Cytoscape visualization Phase 5 visual styling parity', () => {
  test('defines semantic node styles for all ontology node kinds', () => {
    const selectors = createDefaultCytoscapeStylesheet().map((entry) => entry.selector);

    expect(selectors).toEqual(expect.arrayContaining([
      'node[kind = "class"]',
      'node[kind = "object-property"]',
      'node[kind = "datatype-property"]',
      'node[kind = "annotation-property"]',
      'node[kind = "ontology"]',
      'node[kind = "named-individual"]',
      'node[kind = "axiom-support"]',
      'node[kind = "blank-node"]',
      'node[kind = "literal"]'
    ]));
  });

  test('defines directed readable edge styles and interaction selectors', () => {
    const stylesheet = createDefaultCytoscapeStylesheet();
    const edgeStyle = findStyle(stylesheet, 'edge').style;

    expect(edgeStyle).toMatchObject({
      label: 'data(label)',
      'target-arrow-shape': 'triangle',
      'curve-style': 'unbundled-bezier',
      'text-background-opacity': 0.92,
      'text-rotation': 'autorotate'
    });
    expect(findStyle(stylesheet, 'edge[kind = "datatype"]').style['line-color']).toBe('#15803d');
    expect(findStyle(stylesheet, 'node.is-hovered').style['border-width']).toBe(4);
    expect(findStyle(stylesheet, 'node:selected').style['border-color']).toBe('#2563eb');
  });
});

function findStyle(stylesheet, selector) {
  return stylesheet.find((entry) => entry.selector === selector);
}
