import {
  calculateVisibleGraphElementIds,
  clearGraphElementSelection,
  createGraphElementCopyPayload,
  createGraphTermId,
  hideSelectedGraphElements,
  pinGraphNodePosition,
  projectGraphStateToCytoscapeElements,
  projectRdfToGraphState,
  restoreHiddenGraphElements,
  updateGraphElementSelection
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

describe('Cytoscape visualization Phase 8 selection, hiding, dragging, and copy payloads', () => {
  test('selects elements through graph state and hides/restores selected nodes', () => {
    const state = createFixtureState();
    const personId = createGraphTermId(namedNode('http://example.org/Person'));
    const selected = updateGraphElementSelection(state, { elementType: 'node', elementId: personId });
    const hidden = hideSelectedGraphElements(selected);
    const restored = restoreHiddenGraphElements(hidden);

    expect(selected.ui.selectedNodeIds).toEqual([personId]);
    expect(hidden.ui.hiddenNodeIds).toContain(personId);
    expect(calculateVisibleGraphElementIds(hidden).nodeIds.has(personId)).toBe(false);
    expect(restored.ui.hiddenNodeIds).toEqual([]);
  });

  test('projects selected and pinned node state into Cytoscape elements', () => {
    const state = createFixtureState();
    const personId = createGraphTermId(namedNode('http://example.org/Person'));
    const selected = updateGraphElementSelection(state, { elementType: 'node', elementId: personId });
    const pinned = pinGraphNodePosition(selected, personId, { x: 10, y: 20 });
    const nodeElement = projectGraphStateToCytoscapeElements(pinned)
      .find((element) => element.group === 'nodes' && element.data.id === personId);

    expect(nodeElement.selected).toBe(true);
    expect(nodeElement.position).toEqual({ x: 10, y: 20 });
  });

  test('creates copy payloads and clears selection state', () => {
    const state = createFixtureState();
    const edgeElement = projectGraphStateToCytoscapeElements(state)
      .find((element) => element.group === 'edges' && element.data.predicateIri === COMMON_NAMESPACE_IRIS.rdfs.subClassOf);
    const selected = updateGraphElementSelection(state, { elementType: 'edge', elementId: edgeElement.data.id });
    const cleared = clearGraphElementSelection(selected);

    expect(createGraphElementCopyPayload(edgeElement.data)).toMatchObject({
      iri: COMMON_NAMESPACE_IRIS.rdfs.subClassOf,
      curie: 'rdfs:subClassOf',
      tripleId: edgeElement.data.id
    });
    expect(cleared.ui.selectedEdgeIds).toEqual([]);
    expect(cleared.ui.activeInspectorTarget).toBeNull();
  });
});

function createFixtureState() {
  const person = namedNode('http://example.org/Person');
  const employee = namedNode('http://example.org/Employee');
  return projectRdfToGraphState([
    quad(person, namedNode(COMMON_NAMESPACE_IRIS.rdf.type), namedNode(COMMON_NAMESPACE_IRIS.owl.Class)),
    quad(employee, namedNode(COMMON_NAMESPACE_IRIS.rdf.type), namedNode(COMMON_NAMESPACE_IRIS.owl.Class)),
    quad(person, namedNode(COMMON_NAMESPACE_IRIS.rdfs.label), literal('Person')),
    quad(employee, namedNode(COMMON_NAMESPACE_IRIS.rdfs.subClassOf), person)
  ]);
}
