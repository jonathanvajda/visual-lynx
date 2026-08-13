import {
  COMMON_NAMESPACE_IRIS,
  formatIriForDisplay,
  namespacePrefixMapFromRegistry
} from '../namespace-registry/index.js';
import { createGraphTermId } from './graph-ids.js';

/**
 * Builds preferred display labels for RDF terms.
 *
 * Predicate precedence is ontology-oriented: `rdfs:label`, then `skos:prefLabel`,
 * then title/preferred-term style annotations. The returned map is keyed by stable
 * graph term ID so callers can use the same index for GraphState and Cytoscape data.
 *
 * @param {object[]} quads RDF/JS quads.
 * @param {Record<string,string>} [prefixes]
 * @returns {Map<string, {nodeId: string, label: string, predicateIri: string, language: string, datatypeIri: string}>}
 */
export function buildLabelIndex(quads, prefixes = namespacePrefixMapFromRegistry()) {
  const labelPredicateRank = buildPredicateRankMap([
    COMMON_NAMESPACE_IRIS.rdfs.label,
    COMMON_NAMESPACE_IRIS.skos.prefLabel,
    COMMON_NAMESPACE_IRIS.dcterms.title,
    COMMON_NAMESPACE_IRIS.dc?.title,
    COMMON_NAMESPACE_IRIS.iao?.preferredTerm
  ]);
  const bestByNodeId = new Map();

  for (const quad of quads || []) {
    const predicateIri = quad.predicate?.value || '';
    if (!labelPredicateRank.has(predicateIri) || quad.object?.termType !== 'Literal') continue;

    const candidate = {
      nodeId: createGraphTermId(quad.subject),
      label: quad.object.value,
      predicateIri,
      predicateLabel: formatIriForDisplay(predicateIri, prefixes),
      language: quad.object.language || '',
      datatypeIri: quad.object.datatype?.value || '',
      predicateRank: labelPredicateRank.get(predicateIri),
      languageRank: rankLanguage(quad.object.language || '')
    };
    const current = bestByNodeId.get(candidate.nodeId);
    if (!current || compareLabelCandidates(candidate, current) < 0) {
      bestByNodeId.set(candidate.nodeId, Object.freeze(candidate));
    }
  }

  return bestByNodeId;
}

/**
 * Builds deterministic inspector rows for each subject node.
 *
 * Object-property graph edges stay out of the default inspector. Set
 * `includeObjectProperties` when a debug/all-triples panel should show them.
 *
 * @param {object[]} quads RDF/JS quads.
 * @param {{prefixes?: Record<string,string>, typeIrisByNodeId?: Map<string,string[]>}} [classificationIndex]
 * @param {{includeObjectProperties?: boolean}} [options]
 * @returns {Map<string, {nodeId: string, iri: string, typeIris: string[], annotations: object[], datatypeProperties: object[], objectProperties: object[]}>}
 */
export function buildNodePropertyIndex(quads, classificationIndex = {}, options = {}) {
  const prefixes = classificationIndex.prefixes || namespacePrefixMapFromRegistry();
  const recordsByNodeId = new Map();
  const predicateKindByIri = buildPredicateKindIndex(quads);
  const knownAnnotationPredicateIris = buildKnownAnnotationPredicateSet();

  for (const quad of quads || []) {
    const nodeId = createGraphTermId(quad.subject);
    const record = ensurePropertyRecord(recordsByNodeId, nodeId, quad.subject, classificationIndex);
    const predicateIri = quad.predicate?.value || '';

    if (predicateIri === COMMON_NAMESPACE_IRIS.rdf.type) continue;

    const row = createPropertyRow(quad, prefixes);
    const predicateKind = predicateKindByIri.get(predicateIri) || inferPropertyKind(quad, knownAnnotationPredicateIris);
    if (predicateKind === 'object') {
      if (options.includeObjectProperties) record.objectProperties.push(row);
    } else if (predicateKind === 'datatype') {
      record.datatypeProperties.push(row);
    } else {
      record.annotations.push(row);
    }
  }

  for (const record of recordsByNodeId.values()) {
    record.annotations.sort(comparePropertyRows);
    record.datatypeProperties.sort(comparePropertyRows);
    record.objectProperties.sort(comparePropertyRows);
    Object.freeze(record.typeIris);
    Object.freeze(record.annotations);
    Object.freeze(record.datatypeProperties);
    Object.freeze(record.objectProperties);
    Object.freeze(record);
  }

  return recordsByNodeId;
}

/**
 * Builds a compact inspector view model for a selected graph element.
 *
 * @param {object} elementData Cytoscape element `data`.
 * @param {Map<string, object>} propertyIndex
 * @returns {{headingRows: Array<[string,string]>, groups: Array<{label: string, rows: object[]}>}}
 */
export function buildInspectorViewModel(elementData, propertyIndex) {
  const propertyRecord = propertyIndex?.get(elementData?.id);
  return {
    headingRows: [
      ['Kind', elementData?.kind],
      ['Label', elementData?.label],
      ['IRI', elementData?.iri],
      ['Predicate', elementData?.predicateIri],
      ['Graph', elementData?.graphId]
    ].filter(([, value]) => value != null && value !== ''),
    groups: [
      { label: 'Types', rows: (propertyRecord?.typeIris || []).map((typeIri) => ({ predicateLabel: 'rdf:type', value: typeIri, valueKind: 'iri' })) },
      { label: 'Annotations', rows: propertyRecord?.annotations || [] },
      { label: 'Datatype Properties', rows: propertyRecord?.datatypeProperties || [] },
      { label: 'Object Properties', rows: propertyRecord?.objectProperties || [] }
    ].filter((group) => group.rows.length > 0)
  };
}

function buildPredicateKindIndex(quads) {
  const predicateKindByIri = new Map();
  for (const quad of quads || []) {
    if (quad.predicate?.value !== COMMON_NAMESPACE_IRIS.rdf.type || quad.subject?.termType !== 'NamedNode') continue;
    if (quad.object?.value === COMMON_NAMESPACE_IRIS.owl.AnnotationProperty) predicateKindByIri.set(quad.subject.value, 'annotation');
    if (quad.object?.value === COMMON_NAMESPACE_IRIS.owl.DatatypeProperty) predicateKindByIri.set(quad.subject.value, 'datatype');
    if (quad.object?.value === COMMON_NAMESPACE_IRIS.owl.ObjectProperty) predicateKindByIri.set(quad.subject.value, 'object');
  }
  return predicateKindByIri;
}

function buildKnownAnnotationPredicateSet() {
  return new Set([
    COMMON_NAMESPACE_IRIS.rdfs.label,
    COMMON_NAMESPACE_IRIS.rdfs.comment,
    COMMON_NAMESPACE_IRIS.rdfs.isDefinedBy,
    COMMON_NAMESPACE_IRIS.skos.prefLabel,
    COMMON_NAMESPACE_IRIS.skos.altLabel,
    COMMON_NAMESPACE_IRIS.skos.definition,
    COMMON_NAMESPACE_IRIS.skos.example,
    COMMON_NAMESPACE_IRIS.skos.scopeNote,
    COMMON_NAMESPACE_IRIS.dcterms.title,
    COMMON_NAMESPACE_IRIS.dcterms.description,
    COMMON_NAMESPACE_IRIS.dcterms.creator,
    COMMON_NAMESPACE_IRIS.dcterms.contributor,
    COMMON_NAMESPACE_IRIS.dcterms.license,
    COMMON_NAMESPACE_IRIS.dcterms.created,
    COMMON_NAMESPACE_IRIS.dcterms.modified,
    COMMON_NAMESPACE_IRIS.dc?.title,
    COMMON_NAMESPACE_IRIS.dc?.description,
    COMMON_NAMESPACE_IRIS.iao?.definition,
    COMMON_NAMESPACE_IRIS.iao?.alternativeTerm,
    COMMON_NAMESPACE_IRIS.iao?.exampleOfUsage,
    COMMON_NAMESPACE_IRIS.iao?.definitionSource,
    COMMON_NAMESPACE_IRIS.cceo?.definition,
    COMMON_NAMESPACE_IRIS.cceo?.definitionSource,
    COMMON_NAMESPACE_IRIS.cceo?.exampleOfUsage,
    COMMON_NAMESPACE_IRIS.cceo?.elucidation,
    COMMON_NAMESPACE_IRIS.cco2?.definition,
    COMMON_NAMESPACE_IRIS.cco2?.definitionSource
  ].filter(Boolean));
}

function inferPropertyKind(quad, knownAnnotationPredicateIris) {
  if (knownAnnotationPredicateIris.has(quad.predicate?.value || '')) return 'annotation';
  if (quad.object?.termType === 'Literal') return 'datatype';
  return 'object';
}

function createPropertyRow(quad, prefixes) {
  const predicateIri = quad.predicate?.value || '';
  return Object.freeze({
    predicateIri,
    predicateLabel: formatIriForDisplay(predicateIri, prefixes),
    value: getObjectDisplayValue(quad.object, prefixes),
    valueKind: getObjectValueKind(quad.object),
    objectTerm: quad.object,
    datatypeIri: quad.object?.datatype?.value || '',
    language: quad.object?.language || '',
    graphId: createGraphTermId(quad.graph)
  });
}

function getObjectDisplayValue(term, prefixes) {
  if (!term) return '';
  if (term.termType === 'NamedNode') return formatIriForDisplay(term.value, prefixes);
  if (term.termType === 'BlankNode') return `_:${term.value}`;
  if (term.termType === 'Literal') return term.value;
  return String(term.value || '');
}

function getObjectValueKind(term) {
  if (term?.termType === 'NamedNode') return 'iri';
  if (term?.termType === 'BlankNode') return 'blank-node';
  if (term?.termType === 'Literal') return 'literal';
  return 'term';
}

function ensurePropertyRecord(recordsByNodeId, nodeId, subject, classificationIndex) {
  if (!recordsByNodeId.has(nodeId)) {
    recordsByNodeId.set(nodeId, {
      nodeId,
      iri: subject?.termType === 'NamedNode' ? subject.value : '',
      typeIris: Array.from(new Set(classificationIndex.typeIrisByNodeId?.get(nodeId) || [])),
      annotations: [],
      datatypeProperties: [],
      objectProperties: []
    });
  }
  return recordsByNodeId.get(nodeId);
}

function buildPredicateRankMap(predicateIris) {
  return new Map(predicateIris.filter(Boolean).map((predicateIri, index) => [predicateIri, index]));
}

function rankLanguage(language) {
  if (!language) return 1;
  return String(language).toLowerCase() === 'en' ? 0 : 2;
}

function compareLabelCandidates(left, right) {
  return left.predicateRank - right.predicateRank
    || left.languageRank - right.languageRank
    || left.label.localeCompare(right.label);
}

function comparePropertyRows(left, right) {
  return left.predicateLabel.localeCompare(right.predicateLabel)
    || left.value.localeCompare(right.value)
    || left.language.localeCompare(right.language)
    || left.datatypeIri.localeCompare(right.datatypeIri);
}
