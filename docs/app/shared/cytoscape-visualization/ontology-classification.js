import { COMMON_NAMESPACE_IRIS } from '../namespace-registry/index.js';

export const NODE_KIND_PRECEDENCE = Object.freeze([
  'ontology',
  'class',
  'object-property',
  'datatype-property',
  'annotation-property',
  'named-individual',
  'axiom-support',
  'blank-node',
  'literal',
  'resource'
]);

const OWL_RESTRICTION_PREDICATES = Object.freeze(new Set([
  COMMON_NAMESPACE_IRIS.owl.onProperty,
  COMMON_NAMESPACE_IRIS.owl.someValuesFrom,
  COMMON_NAMESPACE_IRIS.owl.allValuesFrom,
  COMMON_NAMESPACE_IRIS.owl.hasValue,
  COMMON_NAMESPACE_IRIS.owl.minCardinality,
  COMMON_NAMESPACE_IRIS.owl.maxCardinality,
  COMMON_NAMESPACE_IRIS.owl.cardinality,
  COMMON_NAMESPACE_IRIS.owl.qualifiedCardinality,
  COMMON_NAMESPACE_IRIS.owl.minQualifiedCardinality,
  COMMON_NAMESPACE_IRIS.owl.maxQualifiedCardinality,
  COMMON_NAMESPACE_IRIS.owl.onClass,
  COMMON_NAMESPACE_IRIS.owl.onDataRange
].filter(Boolean)));

const OWL_AXIOM_PREDICATES = Object.freeze(new Set([
  COMMON_NAMESPACE_IRIS.owl.intersectionOf,
  COMMON_NAMESPACE_IRIS.owl.unionOf,
  COMMON_NAMESPACE_IRIS.owl.complementOf,
  COMMON_NAMESPACE_IRIS.owl.oneOf,
  COMMON_NAMESPACE_IRIS.owl.annotatedSource,
  COMMON_NAMESPACE_IRIS.owl.annotatedProperty,
  COMMON_NAMESPACE_IRIS.owl.annotatedTarget,
  COMMON_NAMESPACE_IRIS.rdf.first,
  COMMON_NAMESPACE_IRIS.rdf.rest
].filter(Boolean)));

const AXIOM_SUPPORT_TYPES = Object.freeze(new Set([
  COMMON_NAMESPACE_IRIS.owl.Restriction,
  COMMON_NAMESPACE_IRIS.owl.Axiom,
  COMMON_NAMESPACE_IRIS.rdf.Statement,
  COMMON_NAMESPACE_IRIS.rdf.List
].filter(Boolean)));

/**
 * Returns whether a predicate should become a visible graph edge.
 *
 * `rdf:type` is classification metadata by default, not an ontology edge. Callers can
 * opt into type edges for debugging or all-triples views.
 *
 * @param {string} predicateIri
 * @param {{includeTypeEdges?: boolean, hiddenPredicateIris?: Iterable<string>}} [options]
 * @returns {boolean}
 */
export function isRenderedPredicate(predicateIri, options = {}) {
  if (!predicateIri) return false;
  if (predicateIri === COMMON_NAMESPACE_IRIS.rdf.type && !options.includeTypeEdges) return false;
  return !(new Set(options.hiddenPredicateIris || [])).has(predicateIri);
}

/**
 * Classifies a graph node using explicit RDF type assertions and structural OWL patterns.
 *
 * @param {{term?: object, typeIris?: string[]}} node
 * @param {{outgoingPredicateIrisByNodeId?: Map<string,string[]>, incomingPredicateIrisByNodeId?: Map<string,string[]>}} [rdfIndex]
 * @returns {string}
 */
export function classifyOntologyNode(node, rdfIndex = {}) {
  const types = new Set(node?.typeIris || []);
  if (types.has(COMMON_NAMESPACE_IRIS.owl.Ontology)) return 'ontology';
  if (types.has(COMMON_NAMESPACE_IRIS.owl.Class) || types.has(COMMON_NAMESPACE_IRIS.rdfs.Class)) return 'class';
  if (types.has(COMMON_NAMESPACE_IRIS.owl.ObjectProperty)) return 'object-property';
  if (types.has(COMMON_NAMESPACE_IRIS.owl.DatatypeProperty)) return 'datatype-property';
  if (types.has(COMMON_NAMESPACE_IRIS.owl.AnnotationProperty)) return 'annotation-property';
  if (types.has(COMMON_NAMESPACE_IRIS.owl.NamedIndividual)) return 'named-individual';
  if (isAxiomSupportNode(node, rdfIndex)) return 'axiom-support';
  if (node?.term?.termType === 'BlankNode') return 'blank-node';
  if (node?.term?.termType === 'Literal') return 'literal';
  return 'resource';
}

/**
 * Detects OWL restriction/list/axiom support blank nodes.
 *
 * These nodes are important for full RDF fidelity, but they are usually visual noise in
 * ontology browsing and should be hidden unless a user requests axiom structure.
 *
 * @param {{id?: string, term?: object, typeIris?: string[]}} node
 * @param {{outgoingPredicateIrisByNodeId?: Map<string,string[]>, incomingPredicateIrisByNodeId?: Map<string,string[]>}} [rdfIndex]
 * @returns {boolean}
 */
export function isAxiomSupportNode(node, rdfIndex = {}) {
  if (node?.term?.termType !== 'BlankNode') return false;

  const types = new Set(node.typeIris || []);
  if ([...types].some((typeIri) => AXIOM_SUPPORT_TYPES.has(typeIri))) return true;

  const outgoing = rdfIndex.outgoingPredicateIrisByNodeId?.get(node.id) || [];
  if (outgoing.some((predicateIri) => OWL_RESTRICTION_PREDICATES.has(predicateIri) || OWL_AXIOM_PREDICATES.has(predicateIri))) return true;

  const incoming = rdfIndex.incomingPredicateIrisByNodeId?.get(node.id) || [];
  return incoming.some((predicateIri) => OWL_AXIOM_PREDICATES.has(predicateIri));
}
