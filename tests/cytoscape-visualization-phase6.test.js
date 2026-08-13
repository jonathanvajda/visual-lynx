import {
  createCytoscapeLayoutOptions,
  createDefaultCytoscapeStylesheet,
  createGraphTermId,
  listCytoscapeLayoutOptions,
  projectGraphStateToCytoscapeElements,
  projectRdfToGraphState
} from '../docs/app/shared/cytoscape-visualization/index.js';

const namedNode = (value) => ({ termType: 'NamedNode', value });
const defaultGraph = () => ({ termType: 'DefaultGraph', value: '' });
const quad = (subject, predicate, object, graph = defaultGraph()) => ({ subject, predicate, object, graph });

describe('Cytoscape visualization Phase 6 layout and edge deconfliction', () => {
  test('exposes layout presets for browser layout controls', () => {
    expect(listCytoscapeLayoutOptions()).toEqual([
      { value: 'overview', label: 'Overview' },
      { value: 'wide', label: 'Wide' },
      { value: 'readable', label: 'Readable' },
      { value: 'compact', label: 'Compact' },
      { value: 'grid', label: 'Grid' },
      { value: 'breadthfirst', label: 'Hierarchy' }
    ]);
    expect(createCytoscapeLayoutOptions('readable')).toMatchObject({
      name: 'cose',
      fit: true,
      idealEdgeLength: 220
    });
    expect(createCytoscapeLayoutOptions('wide').nodeRepulsion).toBeGreaterThan(createCytoscapeLayoutOptions('overview').nodeRepulsion);
    expect(createCytoscapeLayoutOptions('breadthfirst')).toMatchObject({ name: 'breadthfirst', directed: true });
  });

  test('adds deterministic routing metadata for parallel edges and self-loops', () => {
    const node = namedNode('http://example.org/A');
    const parent = namedNode('http://example.org/B');
    const state = projectRdfToGraphState([
      quad(node, namedNode('http://example.org/p1'), parent),
      quad(node, namedNode('http://example.org/p2'), parent),
      quad(node, namedNode('http://example.org/self'), node)
    ]);
    const edges = projectGraphStateToCytoscapeElements(state).filter((element) => element.group === 'edges');
    const parallelEdges = edges.filter((edge) => edge.data.target === createGraphTermId(parent));
    const selfLoop = edges.find((edge) => edge.data.source === edge.data.target);

    expect(parallelEdges.map((edge) => edge.data.parallelEdgeCount)).toEqual([2, 2]);
    expect(new Set(parallelEdges.map((edge) => edge.data.controlPointDistance)).size).toBe(2);
    expect(selfLoop.data.loopDirection).toMatch(/deg$/);
  });

  test('uses routing data fields in edge styles', () => {
    const edgeStyle = createDefaultCytoscapeStylesheet().find((entry) => entry.selector === 'edge').style;

    expect(edgeStyle['control-point-distances']).toBe('data(controlPointDistance)');
    expect(edgeStyle['loop-direction']).toBe('data(loopDirection)');
    expect(edgeStyle['loop-sweep']).toBe('data(loopSweep)');
  });
});
