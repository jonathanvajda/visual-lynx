import {
  createGraphTermId,
  estimateNodeVisualDimensions,
  projectGraphStateToCytoscapeElements,
  projectRdfToGraphState
} from '../docs/app/shared/cytoscape-visualization/index.js';
import {
  COMMON_NAMESPACE_IRIS
} from '../docs/app/shared/namespace-registry/index.js';

const namedNode = (value) => ({ termType: 'NamedNode', value });
const literal = (value, datatype = COMMON_NAMESPACE_IRIS.xsd.string, language = '') => ({
  termType: 'Literal',
  value,
  language,
  datatype: namedNode(datatype)
});
const defaultGraph = () => ({ termType: 'DefaultGraph', value: '' });
const quad = (subject, predicate, object, graph = defaultGraph()) => ({ subject, predicate, object, graph });

describe('Cytoscape visualization Phase 4 RDF-to-Cytoscape projection', () => {
  test('projects RDF terms and predicate labels into Cytoscape element data', () => {
    const person = namedNode('http://example.org/Person');
    const organization = namedNode('http://example.org/Organization');
    const memberOf = namedNode('http://example.org/memberOf');
    const state = projectRdfToGraphState([
      quad(person, namedNode(COMMON_NAMESPACE_IRIS.rdf.type), namedNode(COMMON_NAMESPACE_IRIS.owl.Class)),
      quad(organization, namedNode(COMMON_NAMESPACE_IRIS.rdf.type), namedNode(COMMON_NAMESPACE_IRIS.owl.Class)),
      quad(memberOf, namedNode(COMMON_NAMESPACE_IRIS.rdf.type), namedNode(COMMON_NAMESPACE_IRIS.owl.ObjectProperty)),
      quad(memberOf, namedNode(COMMON_NAMESPACE_IRIS.rdfs.label), literal('member of')),
      quad(person, memberOf, organization),
      quad(person, namedNode(COMMON_NAMESPACE_IRIS.rdfs.label), literal('Person'))
    ]);
    const elements = projectGraphStateToCytoscapeElements(state);
    const nodeElement = elements.find((element) => element.group === 'nodes' && element.data.iri === person.value);
    const edgeElement = elements.find((element) => element.group === 'edges' && element.data.predicateIri === memberOf.value);

    expect(nodeElement.data).toMatchObject({
      label: 'Person',
      kind: 'class',
      term: person,
      visualWidth: expect.any(Number),
      visualHeight: expect.any(Number),
      textMaxWidth: expect.any(Number)
    });
    expect(edgeElement.data).toMatchObject({
      label: 'member of',
      kind: 'object',
      subjectTerm: person,
      predicateTerm: memberOf,
      objectTerm: organization
    });
  });

  test('computes node dimensions for long wrapped labels', () => {
    const shortLabel = estimateNodeVisualDimensions('Short');
    const longLabel = estimateNodeVisualDimensions('SPARQL Protocol and Resource Description Framework Query Language Select Query');

    expect(longLabel.visualWidth).toBeLessThanOrEqual(230);
    expect(longLabel.visualHeight).toBeGreaterThan(shortLabel.visualHeight);
    expect(longLabel.textMaxWidth).toBeLessThan(longLabel.visualWidth);
  });

  test('supports parallel edges, self-loops, and literal node projection', () => {
    const node = namedNode('http://example.org/A');
    const parent = namedNode('http://example.org/B');
    const state = projectRdfToGraphState([
      quad(node, namedNode(COMMON_NAMESPACE_IRIS.rdfs.subClassOf), parent),
      quad(node, namedNode('http://example.org/relatedTo'), parent),
      quad(node, namedNode('http://example.org/refines'), node),
      quad(node, namedNode('http://example.org/count'), literal('2', COMMON_NAMESPACE_IRIS.xsd.integer))
    ], { renderLiteralsAsNodes: true });
    const elements = projectGraphStateToCytoscapeElements(state);
    const edges = elements.filter((element) => element.group === 'edges');

    expect(edges.filter((edge) => edge.data.source === createGraphTermId(node) && edge.data.target === createGraphTermId(parent))).toHaveLength(2);
    expect(edges.some((edge) => edge.data.source === createGraphTermId(node) && edge.data.target === createGraphTermId(node))).toBe(true);
    expect(elements.some((element) => element.group === 'nodes' && element.data.kind === 'literal' && element.data.value === '2')).toBe(true);
    expect(edges.some((edge) => edge.data.kind === 'datatype')).toBe(true);
  });

  test('keeps rdf:type out of normal Cytoscape edges and exposes it in debug mode', () => {
    const subject = namedNode('http://example.org/A');
    const quads = [
      quad(subject, namedNode(COMMON_NAMESPACE_IRIS.rdf.type), namedNode(COMMON_NAMESPACE_IRIS.owl.Class))
    ];

    expect(projectGraphStateToCytoscapeElements(projectRdfToGraphState(quads)).some((element) => element.group === 'edges')).toBe(false);
    expect(projectGraphStateToCytoscapeElements(projectRdfToGraphState(quads, { includeTypeEdges: true })).some((element) => element.group === 'edges' && element.data.predicateIri === COMMON_NAMESPACE_IRIS.rdf.type)).toBe(true);
  });
});
