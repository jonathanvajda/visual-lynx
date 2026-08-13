import {
  buildInspectorViewModel,
  buildLabelIndex,
  buildNodePropertyIndex,
  createGraphTermId,
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

describe('Cytoscape visualization Phase 3 label and property indexes', () => {
  test('prefers rdfs:label and preserves language-tagged multiline labels', () => {
    const subject = namedNode('http://example.org/Entity');
    const labelIndex = buildLabelIndex([
      quad(subject, namedNode(COMMON_NAMESPACE_IRIS.skos.prefLabel), literal('Preferred label')),
      quad(subject, namedNode(COMMON_NAMESPACE_IRIS.rdfs.label), literal('Line one\nLine two', COMMON_NAMESPACE_IRIS.xsd.string, 'en'))
    ]);

    expect(labelIndex.get(createGraphTermId(subject))).toMatchObject({
      label: 'Line one\nLine two',
      predicateIri: COMMON_NAMESPACE_IRIS.rdfs.label,
      language: 'en'
    });
  });

  test('groups annotations, datatype properties, and type IRIs for the inspector', () => {
    const subject = namedNode('http://example.org/Entity');
    const quads = [
      quad(subject, namedNode(COMMON_NAMESPACE_IRIS.rdf.type), namedNode(COMMON_NAMESPACE_IRIS.owl.Class)),
      quad(subject, namedNode(COMMON_NAMESPACE_IRIS.rdfs.comment), literal('Comment', COMMON_NAMESPACE_IRIS.xsd.string, 'en')),
      quad(subject, namedNode('http://example.org/count'), literal('2', COMMON_NAMESPACE_IRIS.xsd.integer))
    ];
    const state = projectRdfToGraphState(quads);
    const record = buildNodePropertyIndex(quads, state.indexes).get(createGraphTermId(subject));

    expect(record.typeIris).toContain(COMMON_NAMESPACE_IRIS.owl.Class);
    expect(record.annotations).toEqual([expect.objectContaining({ predicateIri: COMMON_NAMESPACE_IRIS.rdfs.comment, value: 'Comment' })]);
    expect(record.datatypeProperties).toEqual([expect.objectContaining({ predicateIri: 'http://example.org/count', datatypeIri: COMMON_NAMESPACE_IRIS.xsd.integer })]);
  });

  test('exposes property records on Cytoscape node data and creates grouped inspector view models', () => {
    const subject = namedNode('http://example.org/Entity');
    const state = projectRdfToGraphState([
      quad(subject, namedNode(COMMON_NAMESPACE_IRIS.rdf.type), namedNode(COMMON_NAMESPACE_IRIS.owl.Class)),
      quad(subject, namedNode(COMMON_NAMESPACE_IRIS.rdfs.label), literal('Entity'))
    ]);
    const nodeElement = projectGraphStateToCytoscapeElements(state)
      .find((element) => element.group === 'nodes' && element.data.iri === subject.value);
    const viewModel = buildInspectorViewModel(nodeElement.data, state.indexes.propertyIndex);

    expect(nodeElement.data.propertyRecord).toBeTruthy();
    expect(viewModel.headingRows).toContainEqual(['Label', 'Entity']);
    expect(viewModel.groups.map((group) => group.label)).toEqual(['Types', 'Annotations']);
  });
});
