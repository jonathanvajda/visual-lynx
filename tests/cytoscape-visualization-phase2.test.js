import {
  classifyOntologyNode,
  isAxiomSupportNode,
  isRenderedPredicate,
  projectGraphStateToCytoscapeElements,
  projectRdfToGraphState
} from '../docs/app/shared/cytoscape-visualization/index.js';
import {
  COMMON_NAMESPACE_IRIS
} from '../docs/app/shared/namespace-registry/index.js';

const namedNode = (value) => ({ termType: 'NamedNode', value });
const blankNode = (value) => ({ termType: 'BlankNode', value });
const defaultGraph = () => ({ termType: 'DefaultGraph', value: '' });
const quad = (subject, predicate, object, graph = defaultGraph()) => ({ subject, predicate, object, graph });

describe('Cytoscape visualization Phase 2 ontology classification', () => {
  test('treats rdf:type as classification metadata by default', () => {
    expect(isRenderedPredicate(COMMON_NAMESPACE_IRIS.rdf.type)).toBe(false);
    expect(isRenderedPredicate(COMMON_NAMESPACE_IRIS.rdf.type, { includeTypeEdges: true })).toBe(true);
    expect(isRenderedPredicate(COMMON_NAMESPACE_IRIS.rdfs.subClassOf)).toBe(true);
  });

  test('classifies ontology resources with deterministic precedence', () => {
    expect(classifyOntologyNode({
      term: namedNode('http://example.org/onto'),
      typeIris: [
        COMMON_NAMESPACE_IRIS.owl.Class,
        COMMON_NAMESPACE_IRIS.owl.Ontology
      ]
    })).toBe('ontology');
  });

  test('detects OWL restriction blank nodes and hides them from Cytoscape by default', () => {
    const restriction = blankNode('restriction1');
    const state = projectRdfToGraphState([
      quad(namedNode('http://example.org/Part'), namedNode(COMMON_NAMESPACE_IRIS.rdfs.subClassOf), restriction),
      quad(restriction, namedNode(COMMON_NAMESPACE_IRIS.rdf.type), namedNode(COMMON_NAMESPACE_IRIS.owl.Restriction)),
      quad(restriction, namedNode(COMMON_NAMESPACE_IRIS.owl.onProperty), namedNode('http://example.org/partOf')),
      quad(restriction, namedNode(COMMON_NAMESPACE_IRIS.owl.someValuesFrom), namedNode('http://example.org/Whole'))
    ]);
    const restrictionNode = state.nodes.find((node) => node.term?.termType === 'BlankNode');

    expect(isAxiomSupportNode(restrictionNode, state.indexes)).toBe(true);
    expect(restrictionNode.kind).toBe('axiom-support');
    expect(projectGraphStateToCytoscapeElements(state).some((element) => element.data.kind === 'axiom-support')).toBe(false);
    expect(projectGraphStateToCytoscapeElements(state, { hideAxiomSupportNodes: false }).some((element) => element.data.kind === 'axiom-support')).toBe(true);
  });
});
