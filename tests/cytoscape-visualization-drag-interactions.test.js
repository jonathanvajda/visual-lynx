import {
  calculateNeighborNudgePositions,
  createGraphTermId,
  getFirstDegreeNeighborNodeIds,
  projectRdfToGraphState
} from '../docs/app/shared/cytoscape-visualization/index.js';

const namedNode = (value) => ({ termType: 'NamedNode', value });
const defaultGraph = () => ({ termType: 'DefaultGraph', value: '' });
const quad = (subject, predicate, object, graph = defaultGraph()) => ({ subject, predicate, object, graph });

describe('Cytoscape visualization drag interactions', () => {
  test('finds first-degree neighbors and computes dampened nudge positions', () => {
    const focus = namedNode('http://example.org/Focus');
    const left = namedNode('http://example.org/Left');
    const right = namedNode('http://example.org/Right');
    const state = projectRdfToGraphState([
      quad(focus, namedNode('http://example.org/p'), left),
      quad(right, namedNode('http://example.org/p'), focus)
    ]);
    const neighborIds = getFirstDegreeNeighborNodeIds(state, createGraphTermId(focus));
    const positions = calculateNeighborNudgePositions(
      { x: 0, y: 0 },
      { x: 30, y: -15 },
      new Map(neighborIds.map((nodeId) => [nodeId, { x: 100, y: 100 }])),
      { strength: 0.4 }
    );

    expect(neighborIds).toEqual([createGraphTermId(left), createGraphTermId(right)].sort());
    expect(Array.from(positions.values())).toEqual([
      { x: 112, y: 94 },
      { x: 112, y: 94 }
    ]);
  });
});
