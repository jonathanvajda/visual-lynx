import {
  createGraphEdgeId,
  createGraphTermId,
  projectGraphStateToCytoscapeElements,
  projectRdfToGraphState
} from '../docs/app/shared/cytoscape-visualization/index.js';
import {
  COMMON_NAMESPACE_IRIS
} from '../docs/app/shared/namespace-registry/index.js';

const namedNode = (value) => ({ termType: 'NamedNode', value });
const blankNode = (value) => ({ termType: 'BlankNode', value });
const literal = (value, datatype = COMMON_NAMESPACE_IRIS.xsd.string, language = '') => ({
  termType: 'Literal',
  value,
  language,
  datatype: namedNode(datatype)
});
const defaultGraph = () => ({ termType: 'DefaultGraph', value: '' });
const quad = (subject, predicate, object, graph = defaultGraph()) => ({ subject, predicate, object, graph });

describe('Cytoscape visualization Phase 1 graph IDs', () => {
  test('creates stable IDs for named nodes, blank nodes, literals, and graph terms', () => {
    expect(createGraphTermId(namedNode('http://example.org/A'))).toBe('rdf-term:NamedNode:http%3A%2F%2Fexample.org%2FA');
    expect(createGraphTermId(blankNode('b1'))).toBe('rdf-term:BlankNode:b1');
    expect(createGraphTermId(literal('hello', COMMON_NAMESPACE_IRIS.xsd.string, 'en'))).toBe(
      `rdf-term:Literal:hello:${encodeURIComponent(COMMON_NAMESPACE_IRIS.xsd.string)}:en`
    );
    expect(createGraphTermId(defaultGraph())).toBe('rdf-term:DefaultGraph:');
  });

  test('includes graph name in edge IDs to preserve quad identity', () => {
    const statement = quad(
      namedNode('http://example.org/A'),
      namedNode(COMMON_NAMESPACE_IRIS.rdfs.subClassOf),
      namedNode('http://example.org/B'),
      namedNode('http://example.org/graph')
    );

    expect(createGraphEdgeId(statement)).toContain('rdf-term:NamedNode:http%3A%2F%2Fexample.org%2Fgraph');
  });
});

describe('projectRdfToGraphState', () => {
  test('projects RDF type statements into node classification instead of rendered edges', () => {
    const quads = [
      quad(namedNode('http://example.org/ExampleOntology'), namedNode(COMMON_NAMESPACE_IRIS.rdf.type), namedNode(COMMON_NAMESPACE_IRIS.owl.Ontology)),
      quad(namedNode('http://example.org/Person'), namedNode(COMMON_NAMESPACE_IRIS.rdf.type), namedNode(COMMON_NAMESPACE_IRIS.owl.Class)),
      quad(namedNode('http://example.org/Person'), namedNode(COMMON_NAMESPACE_IRIS.rdfs.label), literal('Person')),
      quad(namedNode('http://example.org/Person'), namedNode(COMMON_NAMESPACE_IRIS.rdfs.subClassOf), namedNode('http://example.org/Entity'))
    ];

    const state = projectRdfToGraphState(quads);
    const person = state.nodes.find((node) => node.iri === 'http://example.org/Person');

    expect(person.kind).toBe('class');
    expect(person.typeIris).toContain(COMMON_NAMESPACE_IRIS.owl.Class);
    expect(person.annotations).toEqual([
      expect.objectContaining({
        predicateIri: COMMON_NAMESPACE_IRIS.rdfs.label,
        value: 'Person'
      })
    ]);
    expect(state.edges).toHaveLength(1);
    expect(state.edges[0]).toMatchObject({
      predicateIri: COMMON_NAMESPACE_IRIS.rdfs.subClassOf,
      kind: 'object'
    });
  });

  test('deduplicates nodes while preserving multiple edge statements and named graphs', () => {
    const subject = namedNode('http://example.org/A');
    const object = namedNode('http://example.org/B');
    const predicate = namedNode('http://example.org/relatesTo');
    const quads = [
      quad(subject, predicate, object, namedNode('http://example.org/g1')),
      quad(subject, predicate, object, namedNode('http://example.org/g2'))
    ];

    const state = projectRdfToGraphState(quads);

    expect(state.nodes.filter((node) => node.iri === subject.value)).toHaveLength(1);
    expect(state.nodes.filter((node) => node.iri === object.value)).toHaveLength(1);
    expect(state.edges).toHaveLength(2);
    expect(new Set(state.edges.map((edge) => edge.graphId)).size).toBe(2);
  });

  test('supports blank nodes and optional literal nodes', () => {
    const quads = [
      quad(blankNode('b1'), namedNode('http://example.org/p'), namedNode('http://example.org/A')),
      quad(namedNode('http://example.org/A'), namedNode('http://example.org/hasValue'), literal('42'), defaultGraph())
    ];

    const defaultState = projectRdfToGraphState(quads);
    const literalEdgeState = projectRdfToGraphState(quads, { renderLiteralsAsNodes: true });

    expect(defaultState.nodes.some((node) => node.kind === 'blank-node')).toBe(true);
    expect(defaultState.edges).toHaveLength(1);
    expect(literalEdgeState.nodes.some((node) => node.kind === 'literal')).toBe(true);
    expect(literalEdgeState.edges).toHaveLength(2);
  });
});

describe('projectGraphStateToCytoscapeElements', () => {
  test('projects visible graph state to Cytoscape element JSON and hides blank nodes by default', () => {
    const state = projectRdfToGraphState([
      quad(namedNode('http://example.org/A'), namedNode('http://example.org/p'), namedNode('http://example.org/B')),
      quad(blankNode('b1'), namedNode('http://example.org/p'), namedNode('http://example.org/A'))
    ]);

    const elements = projectGraphStateToCytoscapeElements(state);
    const nodes = elements.filter((element) => element.group === 'nodes');
    const edges = elements.filter((element) => element.group === 'edges');

    expect(nodes.every((node) => node.data.kind !== 'blank-node')).toBe(true);
    expect(edges).toHaveLength(1);
    expect(elements[0]).toHaveProperty('data.id');
    expect(elements[0]).toHaveProperty('data.label');
  });
});
