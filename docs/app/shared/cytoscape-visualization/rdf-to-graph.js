import {
  COMMON_NAMESPACE_IRIS,
  formatIriForDisplay,
  namespacePrefixMapFromRegistry
} from '../namespace-registry/index.js';
import { createGraphEdgeId, createGraphTermId } from './graph-ids.js';
import { createDefaultGraphUiState, createGraphState } from './graph-state.js';
import {
  NODE_KIND_PRECEDENCE,
  classifyOntologyNode,
  isRenderedPredicate
} from './ontology-classification.js';

/**
 * Projects RDF/JS quads into renderer-independent graph state.
 *
 * @param {object[]} quads RDF/JS quads.
 * @param {{prefixes?: Record<string,string>, focusNodeIri?: string, includeTypeEdges?: boolean, renderLiteralsAsNodes?: boolean, ui?: object}} [options]
 * @returns {object}
 */
export function projectRdfToGraphState(quads, options = {}) {
  const prefixes = options.prefixes || namespacePrefixMapFromRegistry();
  const nodeMap = new Map();
  const typeIrisByNodeId = new Map();
  const annotationsByNodeId = new Map();
  const outgoingPredicateIrisByNodeId = new Map();
  const incomingPredicateIrisByNodeId = new Map();
  const edges = [];
  const focusNodeId = options.focusNodeIri ? createGraphTermId({ termType: 'NamedNode', value: options.focusNodeIri }) : '';

  for (const quad of quads || []) {
    const subject = ensureNode(nodeMap, quad.subject, prefixes);
    const objectNodeId = createGraphTermId(quad.object);
    const predicateIri = quad.predicate?.value || '';

    appendMapValue(outgoingPredicateIrisByNodeId, subject.id, predicateIri);
    appendMapValue(incomingPredicateIrisByNodeId, objectNodeId, predicateIri);

    if (predicateIri === COMMON_NAMESPACE_IRIS.rdf.type) {
      appendMapValue(typeIrisByNodeId, subject.id, quad.object?.value || '');
      if (!isRenderedPredicate(predicateIri, options)) continue;
    }
    if (!isRenderedPredicate(predicateIri, options)) continue;

    if (quad.object?.termType === 'Literal' && !options.renderLiteralsAsNodes) {
      appendMapValue(annotationsByNodeId, subject.id, {
        predicateIri: quad.predicate?.value || '',
        predicateLabel: formatIriForDisplay(quad.predicate?.value || '', prefixes),
        value: quad.object.value,
        datatypeIri: quad.object.datatype?.value || '',
        language: quad.object.language || ''
      });
      continue;
    }

    const object = ensureNode(nodeMap, quad.object, prefixes);
    edges.push(Object.freeze({
      id: createGraphEdgeId(quad),
      subjectId: subject.id,
      predicateId: createGraphTermId(quad.predicate),
      objectId: object.id,
      graphId: createGraphTermId(quad.graph),
      predicateTerm: quad.predicate,
      predicateIri: quad.predicate?.value || '',
      label: formatIriForDisplay(quad.predicate?.value || '', prefixes),
      kind: quad.object?.termType === 'Literal' ? 'datatype' : 'object',
      quad
    }));
  }

  const nodes = Array.from(nodeMap.values())
    .map((node) => {
      const typeIris = Array.from(new Set(typeIrisByNodeId.get(node.id) || []));
      const enrichedNode = {
        ...node,
        typeIris: Object.freeze(typeIris),
        annotations: Object.freeze(annotationsByNodeId.get(node.id) || [])
      };
      return Object.freeze({
        ...enrichedNode,
        kind: classifyOntologyNode(enrichedNode, { outgoingPredicateIrisByNodeId, incomingPredicateIrisByNodeId })
      });
    })
    .filter((node) => !focusNodeId || node.id === focusNodeId || edges.some((edge) => edge.subjectId === node.id && edge.objectId === focusNodeId || edge.subjectId === focusNodeId && edge.objectId === node.id));

  const visibleNodeIds = new Set(nodes.map((node) => node.id));
  return createGraphState({
    nodes,
    edges: edges.filter((edge) => visibleNodeIds.has(edge.subjectId) && visibleNodeIds.has(edge.objectId)),
    quads,
    ui: createDefaultGraphUiState(options.ui),
    indexes: {
      prefixes: Object.freeze({ ...prefixes }),
      typeIrisByNodeId,
      outgoingPredicateIrisByNodeId,
      incomingPredicateIrisByNodeId
    }
  });
}

/**
 * @param {Map<string, object>} nodeMap
 * @param {object} term
 * @param {Record<string,string>} prefixes
 * @returns {object}
 */
function ensureNode(nodeMap, term, prefixes) {
  const id = createGraphTermId(term);
  if (!nodeMap.has(id)) {
    nodeMap.set(id, Object.freeze({
      id,
      term,
      termType: term?.termType || 'DefaultGraph',
      iri: term?.termType === 'NamedNode' ? term.value : '',
      value: term?.value || '',
      label: createNodeLabel(term, prefixes)
    }));
  }
  return nodeMap.get(id);
}

/**
 * @param {object} term
 * @param {Record<string,string>} prefixes
 * @returns {string}
 */
function createNodeLabel(term, prefixes) {
  if (!term || term.termType === 'DefaultGraph') return 'default graph';
  if (term.termType === 'NamedNode') return formatIriForDisplay(term.value, prefixes);
  if (term.termType === 'BlankNode') return `_:${term.value}`;
  if (term.termType === 'Literal') return term.value;
  return String(term.value || term.termType || 'term');
}

/**
 * @param {object} term
 * @param {string[]} typeIris
 * @returns {string}
 */
export function classifyNodeKind(term, typeIris = []) {
  return classifyOntologyNode({ term, typeIris });
}

/**
 * @param {Map<string, any[]>} map
 * @param {string} key
 * @param {any} value
 * @returns {void}
 */
function appendMapValue(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

export { NODE_KIND_PRECEDENCE };
