/**
 * Creates stable renderer-independent IDs for RDF terms and statements.
 *
 * The IDs are transient UI/model identifiers, not persisted semantic data.
 */

/**
 * @param {object|null|undefined} term RDF/JS term.
 * @returns {string}
 */
export function createGraphTermId(term) {
  if (!term || term.termType === 'DefaultGraph') return 'rdf-term:DefaultGraph:';
  const termType = String(term.termType || 'Unknown');
  if (termType === 'Literal') {
    const datatype = term.datatype?.value || '';
    const language = term.language || '';
    return `rdf-term:Literal:${encodePart(term.value)}:${encodePart(datatype)}:${encodePart(language)}`;
  }
  return `rdf-term:${termType}:${encodePart(term.value)}`;
}

/**
 * @param {object} quad RDF/JS quad.
 * @returns {string}
 */
export function createGraphEdgeId(quad) {
  return [
    'rdf-edge',
    createGraphTermId(quad.subject),
    createGraphTermId(quad.predicate),
    createGraphTermId(quad.object),
    createGraphTermId(quad.graph)
  ].join('|');
}

/**
 * @param {string} value
 * @returns {string}
 */
function encodePart(value) {
  return encodeURIComponent(String(value ?? ''));
}
