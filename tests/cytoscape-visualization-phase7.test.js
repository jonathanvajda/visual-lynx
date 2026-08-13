import {
  buildGraphFilterOptionIndex,
  buildGraphFilterPanelViewModel,
  calculateVisibleGraphElementIds,
  createGraphTermId,
  projectGraphStateToCytoscapeElements,
  projectRdfToGraphState,
  selectGraphElementIds,
  updateGraphVisibilityFilters
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

describe('Cytoscape visualization Phase 7 filtering and visibility', () => {
  test('builds filter options and applies kind/predicate/subject/object filters', () => {
    const state = createFilterFixtureState();
    const personId = createGraphTermId(namedNode('http://example.org/Person'));
    const organizationId = createGraphTermId(namedNode('http://example.org/Organization'));
    const options = buildGraphFilterOptionIndex(state);
    const filtered = updateGraphVisibilityFilters(state, {
      visibleKinds: ['class'],
      visiblePredicates: ['http://example.org/memberOf'],
      visibleSubjectIds: [personId],
      visibleObjectIds: [organizationId]
    });
    const visible = calculateVisibleGraphElementIds(filtered);
    const elements = projectGraphStateToCytoscapeElements(filtered);

    expect(options.kinds).toEqual(expect.arrayContaining([expect.objectContaining({ value: 'class', count: 3 })]));
    expect(options.predicates).toEqual(expect.arrayContaining([expect.objectContaining({ value: 'http://example.org/memberOf', label: 'member of' })]));
    expect(visible.nodeIds).toEqual(new Set([personId, organizationId]));
    expect(elements.filter((element) => element.group === 'edges')).toHaveLength(1);
  });

  test('builds filter panel counts and supports pointer-style selection semantics', () => {
    const filtered = updateGraphVisibilityFilters(createFilterFixtureState(), { visibleKinds: ['object-property'] });
    const viewModel = buildGraphFilterPanelViewModel(filtered);
    const single = selectGraphElementIds([], ['a', 'b', 'c'], 'a');
    const additive = selectGraphElementIds(single.selectedIds, ['a', 'b', 'c'], 'c', { ctrlKey: true });
    const range = selectGraphElementIds([], ['a', 'b', 'c'], 'c', { shiftKey: true, anchorId: 'a' });

    expect(viewModel.counts.hiddenNodes).toBeGreaterThan(0);
    expect(additive.selectedIds).toEqual(['a', 'c']);
    expect(range.selectedIds).toEqual(['a', 'b', 'c']);
  });
});

function createFilterFixtureState() {
  const person = namedNode('http://example.org/Person');
  const organization = namedNode('http://example.org/Organization');
  const employee = namedNode('http://example.org/Employee');
  const memberOf = namedNode('http://example.org/memberOf');
  return projectRdfToGraphState([
    quad(person, namedNode(COMMON_NAMESPACE_IRIS.rdf.type), namedNode(COMMON_NAMESPACE_IRIS.owl.Class)),
    quad(organization, namedNode(COMMON_NAMESPACE_IRIS.rdf.type), namedNode(COMMON_NAMESPACE_IRIS.owl.Class)),
    quad(employee, namedNode(COMMON_NAMESPACE_IRIS.rdf.type), namedNode(COMMON_NAMESPACE_IRIS.owl.Class)),
    quad(memberOf, namedNode(COMMON_NAMESPACE_IRIS.rdf.type), namedNode(COMMON_NAMESPACE_IRIS.owl.ObjectProperty)),
    quad(memberOf, namedNode(COMMON_NAMESPACE_IRIS.rdfs.label), literal('member of')),
    quad(person, namedNode(COMMON_NAMESPACE_IRIS.rdfs.label), literal('Person')),
    quad(organization, namedNode(COMMON_NAMESPACE_IRIS.rdfs.label), literal('Organization')),
    quad(person, memberOf, organization),
    quad(employee, namedNode(COMMON_NAMESPACE_IRIS.rdfs.subClassOf), person),
    quad(blankNode('support'), namedNode('http://example.org/p'), person)
  ]);
}
