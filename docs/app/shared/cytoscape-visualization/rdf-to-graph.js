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
import { buildLabelIndex, buildNodePropertyIndex } from './label-property-index.js';

/**
 * Projects RDF/JS quads into renderer-independent graph state.
 *
 * @param {object[]} quads RDF/JS quads.
 * @param {{prefixes?: Record<string,string>, focusNodeIri?: string, includeTypeEdges?: boolean, renderLiteralsAsNodes?: boolean, blankNodeProjectionMode?: 'include'|'exclude', axiomSupportProjectionMode?: 'include'|'exclude', ui?: object}} [options]
 * @returns {object}
 */
export function projectRdfToGraphState(quads, options = {}) {
  const sourceQuads = Array.from(quads || []);
  const prefixes = options.prefixes || namespacePrefixMapFromRegistry();
  const projectionPolicy = createRdfGraphProjectionPolicy(options);
  const nodeMap = new Map();
  const typeIrisByNodeId = new Map();
  const annotationsByNodeId = new Map();
  const outgoingPredicateIrisByNodeId = new Map();
  const incomingPredicateIrisByNodeId = new Map();
  const edges = [];
  const focusNodeId = options.focusNodeIri ? createGraphTermId({ termType: 'NamedNode', value: options.focusNodeIri }) : '';

  for (const quad of sourceQuads) {
    const subjectNodeId = createGraphTermId(quad.subject);
    const objectNodeId = createGraphTermId(quad.object);
    const predicateIri = quad.predicate?.value || '';

    appendMapValue(outgoingPredicateIrisByNodeId, subjectNodeId, predicateIri);
    appendMapValue(incomingPredicateIrisByNodeId, objectNodeId, predicateIri);

    if (predicateIri === COMMON_NAMESPACE_IRIS.rdf.type) {
      appendMapValue(typeIrisByNodeId, subjectNodeId, quad.object?.value || '');
    }
  }

  const classificationIndex = {
    prefixes: Object.freeze({ ...prefixes }),
    typeIrisByNodeId,
    outgoingPredicateIrisByNodeId,
    incomingPredicateIrisByNodeId
  };

  for (const quad of sourceQuads) {
    const predicateIri = quad.predicate?.value || '';
    const subject = projectRdfTermToGraphNode(nodeMap, quad.subject, prefixes, classificationIndex, projectionPolicy);
    if (!subject) continue;

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

    const object = projectRdfTermToGraphNode(nodeMap, quad.object, prefixes, classificationIndex, projectionPolicy);
    if (!object) continue;

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

  const labelIndex = buildLabelIndex(sourceQuads, prefixes);
  const propertyIndex = buildNodePropertyIndex(sourceQuads, classificationIndex);

  const focusVisibleNodeIds = buildFocusVisibleNodeIds(edges, focusNodeId);
  const nodes = Array.from(nodeMap.values())
    .map((node) => {
      const typeIris = Array.from(new Set(typeIrisByNodeId.get(node.id) || []));
      const enrichedNode = {
        ...node,
        label: labelIndex.get(node.id)?.label || node.label,
        typeIris: Object.freeze(typeIris),
        annotations: Object.freeze(annotationsByNodeId.get(node.id) || [])
      };
      return Object.freeze({
        ...enrichedNode,
        kind: classifyOntologyNode(enrichedNode, { outgoingPredicateIrisByNodeId, incomingPredicateIrisByNodeId })
      });
    })
    .filter((node) => !focusNodeId || focusVisibleNodeIds.has(node.id));

  const visibleNodeIds = new Set(nodes.map((node) => node.id));
  return createGraphState({
    nodes,
    edges: edges.filter((edge) => visibleNodeIds.has(edge.subjectId) && visibleNodeIds.has(edge.objectId)),
    quads: sourceQuads,
    ui: createDefaultGraphUiState(options.ui),
    indexes: {
      ...classificationIndex,
      labelIndex,
      propertyIndex,
      projectionPolicy
    }
  });
}

/**
 * Creates a small policy object that decides which RDF terms become visual graph
 * terms. It never filters `GraphState.quads`; it only governs the renderable
 * node/edge projection used by Cytoscape.
 *
 * @param {{blankNodeProjectionMode?: 'include'|'exclude', axiomSupportProjectionMode?: 'include'|'exclude'}} [options]
 * @returns {{blankNodeProjectionMode: 'include'|'exclude', axiomSupportProjectionMode: 'include'|'exclude'}}
 */
export function createRdfGraphProjectionPolicy(options = {}) {
  return Object.freeze({
    blankNodeProjectionMode: normalizeProjectionMode(options.blankNodeProjectionMode, 'include'),
    axiomSupportProjectionMode: normalizeProjectionMode(options.axiomSupportProjectionMode, 'include')
  });
}

/**
 * Returns whether a term should be present in the renderable graph projection.
 *
 * @param {object} term RDF/JS term.
 * @param {{typeIris?: string[], kind?: string}} classification
 * @param {{blankNodeProjectionMode?: 'include'|'exclude', axiomSupportProjectionMode?: 'include'|'exclude'}} projectionPolicy
 * @returns {boolean}
 */
export function shouldProjectRdfTermToGraph(term, classification = {}, projectionPolicy = createRdfGraphProjectionPolicy()) {
  if (!term) return false;
  if (term.termType !== 'BlankNode') return true;
  if (classification.kind === 'axiom-support') return projectionPolicy.axiomSupportProjectionMode !== 'exclude';
  return projectionPolicy.blankNodeProjectionMode !== 'exclude';
}

/**
 * @param {Map<string, object>} nodeMap
 * @param {object} term
 * @param {Record<string,string>} prefixes
 * @param {{outgoingPredicateIrisByNodeId?: Map<string,string[]>, incomingPredicateIrisByNodeId?: Map<string,string[]>, typeIrisByNodeId?: Map<string,string[]>}} classificationIndex
 * @param {{blankNodeProjectionMode?: 'include'|'exclude', axiomSupportProjectionMode?: 'include'|'exclude'}} projectionPolicy
 * @returns {object|null}
 */
function projectRdfTermToGraphNode(nodeMap, term, prefixes, classificationIndex, projectionPolicy) {
  const id = createGraphTermId(term);
  const typeIris = Array.from(new Set(classificationIndex.typeIrisByNodeId?.get(id) || []));
  const kind = classifyOntologyNode({ id, term, typeIris }, classificationIndex);
  if (!shouldProjectRdfTermToGraph(term, { typeIris, kind }, projectionPolicy)) return null;
  return ensureNode(nodeMap, term, prefixes);
}

/**
 * @param {string} mode
 * @param {'include'|'exclude'} fallback
 * @returns {'include'|'exclude'}
 */
function normalizeProjectionMode(mode, fallback) {
  return mode === 'include' || mode === 'exclude' ? mode : fallback;
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

function buildFocusVisibleNodeIds(edges, focusNodeId) {
  if (!focusNodeId) return new Set();
  const visibleNodeIds = new Set([focusNodeId]);
  for (const edge of edges) {
    if (edge.subjectId === focusNodeId) visibleNodeIds.add(edge.objectId);
    if (edge.objectId === focusNodeId) visibleNodeIds.add(edge.subjectId);
  }
  return visibleNodeIds;
}

export { NODE_KIND_PRECEDENCE };
