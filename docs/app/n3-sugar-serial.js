/* n3-sugar-serial.js
 * Syntactic sugar for N3.js-backed RDF serializations.
 *
 * Exposes window.N3SugarSerial with:
 * - supports(mimeType)
 * - supportsInlineComments(mimeType)
 * - prettify({ text, mimeType, baseIRI, logger })
 * - extractPrefixes({ text, mimeType })
 */
import {
  COMMON_NAMESPACE_IRIS,
  namespacePrefixMapFromRegistry
} from './shared/namespace-registry/namespace-registry.js';
import { normalizePrefixMap } from './shared/namespace-registry/prefix-map.js';
import { compactIriToCurie, findLongestPrefixMatch } from './shared/namespace-registry/curie.js';
import { extractTurtlePrefixDeclarations } from './shared/namespace-registry/rdf-prefixes.js';
import {
  parseRdfTextWithN3,
  serializeRdfDatasetToNQuads,
  serializeRdfDatasetToNTriples
} from './shared/rdf-io/index.js';

(function (global) {
  'use strict';

  const NS = COMMON_NAMESPACE_IRIS;
  const STANDARD_PREFIXES = namespacePrefixMapFromRegistry();

  const RDF_TYPE = NS.rdf.type;
  const RDF_FIRST = NS.rdf.first;
  const RDF_REST = NS.rdf.rest;
  const RDF_NIL = NS.rdf.nil;

  const SECTION_TYPES = Object.freeze([
    { key: 'annotationProperties', label: 'Annotation properties', iri: NS.owl.AnnotationProperty },
    { key: 'dataProperties', label: 'Datatype properties', iri: NS.owl.DatatypeProperty },
    { key: 'objectProperties', label: 'Object Properties', iri: NS.owl.ObjectProperty },
    { key: 'classes', label: 'Classes', iri: NS.owl.Class },
    { key: 'individuals', label: 'Individuals', iri: NS.owl.NamedIndividual },
  ]);

  const DEFAULT_PREFIXES = STANDARD_PREFIXES;

  const normalizeMimeType = (mimeType) => {
    const lower = String(mimeType || '').trim().toLowerCase();
    if (lower === 'ttl' || lower === 'turtle') return 'text/turtle';
    if (lower === 'trig') return 'application/trig';
    if (lower === 'nt' || lower === 'ntriples' || lower === 'n-triples') return 'application/n-triples';
    if (lower === 'nq' || lower === 'nquads' || lower === 'n-quads') return 'application/n-quads';
    return lower;
  };

  const supports = (mimeType) => [
    'text/turtle',
    'application/trig',
    'application/n-triples',
    'application/n-quads',
  ].includes(normalizeMimeType(mimeType));

  const asPrefixIri = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (value.value) return value.value;
    return String(value);
  };

  const escapeLiteral = (value) => String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');

  const normalizeLiteralValue = (value) => {
    const text = String(value);
    if (!/[\r\n]/.test(text)) return text;
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join(' ');
  };

  const escapeIri = (value) => String(value).replace(/>/g, '%3E');

  const extractPrefixes = ({ text, mimeType } = {}) => {
    const mime = normalizeMimeType(mimeType);
    if (mime !== 'text/turtle' && mime !== 'application/trig') return {};

    return extractTurtlePrefixDeclarations(text);
  };

  const getPrefixes = (parsedPrefixes) => {
    const prefixes = {};
    Object.keys(parsedPrefixes || {}).forEach((key) => {
      prefixes[key] = asPrefixIri(parsedPrefixes[key]);
    });
    Object.entries(DEFAULT_PREFIXES).forEach(([key, iri]) => {
      const alreadyNamed = Object.values(prefixes).some((existingIri) => existingIri === iri);
      if (!alreadyNamed && !prefixes[key]) prefixes[key] = iri;
    });
    return normalizePrefixMap(prefixes).prefixes;
  };

  const prefixEntries = (prefixes) => Object.entries(prefixes || {})
    .filter(([, iri]) => iri)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

  const namedNodeToText = (iri, prefixes) => {
    const compacted = compactIriToCurie(iri, prefixes);
    if (compacted.ok) return compacted.value;

    const match = findLongestPrefixMatch(iri, prefixes);
    if (match.ok) {
      const local = iri.slice(match.namespaceIri.length);
      if (match.prefix === '' && local) return `:${local}`;
    }
    return `<${escapeIri(iri)}>`;
  };

  const termToText = (term, prefixes) => {
    if (!term) return '';
    if (term.termType === 'NamedNode') return namedNodeToText(term.value, prefixes);
    if (term.termType === 'BlankNode') return `_:${term.value}`;
    if (term.termType === 'DefaultGraph') return '';
    if (term.termType === 'Literal') {
      const lexical = `"${escapeLiteral(normalizeLiteralValue(term.value))}"`;
      if (term.language) return `${lexical}@${term.language}`;
      const datatype = term.datatype && term.datatype.value;
      if (!datatype || datatype === NS.xsd.string) return lexical;
      return `${lexical}^^${namedNodeToText(datatype, prefixes)}`;
    }
    return String(term.value || '');
  };

  const termSortKey = (term, prefixes) => termToText(term, prefixes).toLowerCase();

  const captureBase = (text) => {
    const turtleBase = String(text || '').match(/@base\s+<([^>]+)>\s*\./i);
    if (turtleBase) return turtleBase[1];
    const sparqlBase = String(text || '').match(/\bBASE\s+<([^>]+)>/i);
    return sparqlBase ? sparqlBase[1] : '';
  };

  const parseWithN3 = (text, mimeType, baseIRI) => {
    const N3 = global.N3;
    if (!N3 || !N3.Parser) {
      throw new Error('N3 library not available for RDF prettification');
    }

    const parsed = parseRdfTextWithN3(text, {
      format: mimeType,
      baseIri: baseIRI,
      runtime: { N3 }
    });
    return { store: parsed.dataset, prefixes: getPrefixes(parsed.prefixes || {}) };
  };

  const sectionComment = (label) => [
    '#################################################################',
    `#    ${label}`,
    '#################################################################',
  ].join('\n');

  const subjectHeader = (term, prefixes) => {
    const iri = term && term.termType === 'NamedNode' ? term.value : termToText(term, prefixes);
    return `###  ${iri}`;
  };

  const getSubjectTypeIris = (store, subject) => store
    .getQuads(subject, null, null, null)
    .filter((quad) => quad.predicate.value === RDF_TYPE && quad.object.termType === 'NamedNode')
    .map((quad) => quad.object.value);

  const classifySubject = (store, subject) => {
    const typeIris = getSubjectTypeIris(store, subject);
    if (typeIris.includes(NS.owl.Ontology)) return 'ontology';

    const entityType = SECTION_TYPES.find((section) => typeIris.includes(section.iri));
    if (entityType) return entityType.key;

    if (subject.termType === 'BlankNode' || typeIris.length) return 'extraAxioms';
    return 'extraAnnotations';
  };

  const sortedSubjects = (store, prefixes) => {
    const byId = new Map();
    store.getQuads(null, null, null, null).forEach((quad) => {
      const id = `${quad.subject.termType}:${quad.subject.value}`;
      if (!byId.has(id)) byId.set(id, quad.subject);
    });
    return Array.from(byId.values()).sort((a, b) => termSortKey(a, prefixes).localeCompare(termSortKey(b, prefixes)));
  };

  const ontologyPredicateRank = (predicateIri) => {
    if (predicateIri === RDF_TYPE) return 0;
    if (predicateIri === NS.owl.versionIRI) return 10;
    if (predicateIri === NS.owl.imports) return 20;
    if (predicateIri === NS.dc.title || predicateIri === NS.dcterms.title) return 30;
    if (predicateIri === NS.dc.creator || predicateIri === NS.dcterms.creator) return 40;
    if (predicateIri === NS.dc.contributor || predicateIri === NS.dcterms.contributor) return 50;
    if (predicateIri === NS.dc.description || predicateIri === NS.dcterms.description) return 60;
    if (predicateIri === NS.dcterms.license) return 70;
    if (predicateIri === NS.dc.rights || predicateIri === NS.dcterms.rights) return 80;
    if (predicateIri === NS.rdfs.comment) return 90;
    if (predicateIri === NS.rdfs.label) return 100;
    if (predicateIri === NS.owl.versionInfo) return 110;
    if (predicateIri === NS.skos.scopeNote) return 120;
    return 500;
  };

  const predicateRank = (predicateIri, subjectKind) => {
    if (subjectKind === 'ontology') return ontologyPredicateRank(predicateIri);
    if (predicateIri === RDF_TYPE) return 0;

    const owlRank = [
      NS.owl.equivalentClass,
      NS.owl.disjointWith,
      NS.owl.complementOf,
      NS.owl.intersectionOf,
      NS.owl.unionOf,
      NS.owl.oneOf,
      NS.owl.inverseOf,
      NS.owl.propertyChainAxiom,
      NS.owl.TransitiveProperty,
      NS.owl.SymmetricProperty,
      NS.owl.AsymmetricProperty,
      NS.owl.ReflexiveProperty,
      NS.owl.IrreflexiveProperty,
      NS.owl.FunctionalProperty,
      NS.owl.InverseFunctionalProperty,
    ].indexOf(predicateIri);
    if (owlRank >= 0) return 10 + owlRank;

    if (predicateIri === NS.rdfs.subClassOf) return 100;
    if (predicateIri === NS.rdfs.subPropertyOf) return 101;
    if (predicateIri === NS.rdfs.domain) return 120;
    if (predicateIri === NS.rdfs.range) return 121;
    if (predicateIri === NS.rdfs.label) return 200;
    return 500;
  };

  const getOnlyObject = (store, subject, predicateIri) => {
    const matches = store.getQuads(subject, null, null, null)
      .filter((quad) => quad.predicate.value === predicateIri);
    return matches.length === 1 ? matches[0].object : null;
  };

  const parseRdfList = (store, head, seen = new Set()) => {
    if (!head || head.termType !== 'BlankNode') return null;
    const items = [];
    let current = head;

    while (current && current.termType === 'BlankNode') {
      const currentKey = current.value;
      if (seen.has(currentKey)) return null;
      seen.add(currentKey);

      const first = getOnlyObject(store, current, RDF_FIRST);
      const rest = getOnlyObject(store, current, RDF_REST);
      if (!first || !rest) return null;

      items.push(first);
      if (rest.termType === 'NamedNode' && rest.value === RDF_NIL) return items;
      current = rest;
    }

    return null;
  };

  const comparePredicates = (left, right, prefixes, subjectKind) => {
    const rankCompare = predicateRank(left.value, subjectKind) - predicateRank(right.value, subjectKind);
    if (rankCompare) return rankCompare;
    return termSortKey(left, prefixes).localeCompare(termSortKey(right, prefixes));
  };

  const sortedPredicates = (quads, prefixes, subjectKind) => {
    const byPredicate = new Map();
    quads.filter((quad) => !isIgnorableWhitespaceValueQuad(quad)).forEach((quad) => {
      const key = `${quad.predicate.termType}:${quad.predicate.value}`;
      if (!byPredicate.has(key)) byPredicate.set(key, { predicate: quad.predicate, objects: [] });
      byPredicate.get(key).objects.push(quad.object);
    });
    return Array.from(byPredicate.values()).sort((a, b) => {
      return comparePredicates(a.predicate, b.predicate, prefixes, subjectKind);
    });
  };

  const formatObject = (store, term, prefixes, seen = new Set()) => {
    if (!term || term.termType !== 'BlankNode') return termToText(term, prefixes);

    const key = term.value;
    if (seen.has(key)) return termToText(term, prefixes);
    const nextSeen = new Set(seen);
    nextSeen.add(key);

    const listItems = parseRdfList(store, term, new Set(seen));
    if (listItems) {
      return `( ${listItems.map((item) => formatObject(store, item, prefixes, nextSeen)).join(' ')} )`;
    }

    const quads = store.getQuads(term, null, null, null)
      .filter((quad) => quad.predicate.value !== RDF_FIRST && quad.predicate.value !== RDF_REST);
    if (!quads.length) return termToText(term, prefixes);

    const predicateGroups = sortedPredicates(quads, prefixes);
    const lines = predicateGroups.map((group, groupIndex) => {
      const predicate = termToText(group.predicate, prefixes);
      const objects = group.objects
        .slice()
        .sort((a, b) => termSortKey(a, prefixes).localeCompare(termSortKey(b, prefixes)))
        .map((object) => formatObject(store, object, prefixes, nextSeen));
      const ending = groupIndex === predicateGroups.length - 1 ? '' : ' ;';
      return `${predicate} ${objects.join(' , ')}${ending}`;
    });

    return `[ ${lines.join('\n  ')} ]`;
  };

  const referencedBlankNodeIds = (store) => {
    const ids = new Set();
    store.getQuads(null, null, null, null).forEach((quad) => {
      if (quad.object.termType === 'BlankNode') ids.add(quad.object.value);
    });
    return ids;
  };

  const isIgnorableWhitespaceValueQuad = (quad) => {
    return quad &&
      quad.predicate &&
      quad.predicate.value === NS.rdf.value &&
      quad.object &&
      quad.object.termType === 'Literal' &&
      !normalizeLiteralValue(quad.object.value);
  };

  const formatTurtleSubject = (store, subject, prefixes, options = {}) => {
    const quads = store.getQuads(subject, null, null, null)
      .filter((quad) => !isIgnorableWhitespaceValueQuad(quad));
    const predicateGroups = sortedPredicates(quads, prefixes, options.subjectKind);
    const subjectText = termToText(subject, prefixes);
    if (!predicateGroups.length) return '';

    const firstIndent = `${subjectText} `;
    const continuationIndent = ' '.repeat(firstIndent.length);
    const lines = [];

    predicateGroups.forEach((group, groupIndex) => {
      const predicate = termToText(group.predicate, prefixes);
      const objects = group.objects.slice().sort((a, b) => termSortKey(a, prefixes).localeCompare(termSortKey(b, prefixes)));
      const predicateText = `${predicate} `;
      const objectIndent = ' '.repeat(firstIndent.length + predicateText.length);
      const renderedObjects = objects.map((object) => formatObject(store, object, prefixes));
      const ending = groupIndex === predicateGroups.length - 1 ? ' .' : ' ;';
      const head = groupIndex === 0 ? firstIndent : continuationIndent;

      if (renderedObjects.length === 1) {
        lines.push(`${head}${predicateText}${renderedObjects[0]}${ending}`);
        return;
      }

      renderedObjects.forEach((objectText, objectIndex) => {
        if (objectIndex === 0) {
          lines.push(`${head}${predicateText}${objectText} ,`);
        } else {
          const objectEnding = objectIndex === renderedObjects.length - 1 ? ending : ' ,';
          lines.push(`${objectIndent}${objectText}${objectEnding}`);
        }
      });
    });

    return lines.join('\n');
  };

  const formatNTriplesLike = (store, subjects, prefixes, mimeType) => {
    const blocks = [];
    subjects.forEach((subject) => {
      const quads = store.getQuads(subject, null, null, null).slice().sort((a, b) => {
        const predicateCompare = comparePredicates(a.predicate, b.predicate, prefixes);
        if (predicateCompare) return predicateCompare;
        return termSortKey(a.object, prefixes).localeCompare(termSortKey(b.object, prefixes));
      });
      const serialized = mimeType === 'application/n-quads'
        ? serializeRdfDatasetToNQuads(quads)
        : serializeRdfDatasetToNTriples(quads);
      if (serialized.trim()) blocks.push(serialized.trim());
    });
    return blocks.join('\n');
  };

  const buildSections = (store, prefixes) => {
    const sections = {
      ontology: [],
      annotationProperties: [],
      objectProperties: [],
      dataProperties: [],
      classes: [],
      individuals: [],
      extraAnnotations: [],
      extraAxioms: [],
    };

    const inlinedBlankNodes = referencedBlankNodeIds(store);
    sortedSubjects(store, prefixes).forEach((subject) => {
      if (subject.termType === 'BlankNode' && inlinedBlankNodes.has(subject.value)) return;
      sections[classifySubject(store, subject)].push(subject);
    });
    return sections;
  };

  const formatPrefixes = (prefixes, baseIRI) => {
    const seenIris = new Set();
    const explicitPrefixes = Object.entries(prefixes || {})
      .filter(([, iri]) => iri)
      .filter(([, iri]) => {
        if (seenIris.has(iri)) return false;
        seenIris.add(iri);
        return true;
      })
      .sort(([a], [b]) => {
        if (a === '') return -1;
        if (b === '') return 1;
        return a.localeCompare(b);
      })
      .map(([prefix, iri]) => `@prefix ${prefix ? `${prefix}:` : ':'} <${escapeIri(iri)}> .`);

    if (baseIRI) explicitPrefixes.push(`@base <${escapeIri(baseIRI)}> .`);
    return explicitPrefixes.join('\n');
  };

  const prettifyN3Like = ({ text, mimeType, baseIRI }) => {
    const mime = normalizeMimeType(mimeType);
    const { store, prefixes } = parseWithN3(text, mime, baseIRI);
    const hasNamedGraphs = store.getQuads(null, null, null, null)
      .some((quad) => quad.graph && quad.graph.termType !== 'DefaultGraph');
    if (mime === 'application/trig' && hasNamedGraphs) {
      throw new Error('TriG prettification is currently limited to default-graph data.');
    }

    const sections = buildSections(store, prefixes);
    const ontologyBase = sections.ontology.length === 1 && sections.ontology[0].termType === 'NamedNode'
      ? sections.ontology[0].value
      : '';
    const base = captureBase(text) || (baseIRI && baseIRI !== 'http://example.org/' ? baseIRI : ontologyBase);
    const parts = [];

    if (mime === 'text/turtle' || mime === 'application/trig') {
      parts.push(formatPrefixes(prefixes, base));
    }

    sections.ontology.forEach((subject) => {
      parts.push(formatTurtleSubject(store, subject, prefixes, { subjectKind: 'ontology' }));
    });

    const pushSubjectBlock = (subject) => {
      parts.push([
        subjectHeader(subject, prefixes),
        formatTurtleSubject(store, subject, prefixes),
      ].filter(Boolean).join('\n'));
    };

    const pushNTriplesLikeSubjectBlock = (subject) => {
      parts.push([
        subjectHeader(subject, prefixes),
        formatNTriplesLike(store, [subject], prefixes, mime),
      ].filter(Boolean).join('\n'));
    };

    SECTION_TYPES.forEach((section) => {
      const subjects = sections[section.key];
      if (!subjects.length) return;
      parts.push(sectionComment(section.label));
      subjects.forEach((subject) => {
        if (mime === 'application/n-triples' || mime === 'application/n-quads') {
          pushNTriplesLikeSubjectBlock(subject);
        } else {
          pushSubjectBlock(subject);
        }
      });
    });

    [
      { key: 'extraAnnotations', label: 'Extra annotations' },
      { key: 'extraAxioms', label: 'Extra axioms' },
    ].forEach((section) => {
      const subjects = sections[section.key];
      if (!subjects.length) return;
      parts.push(sectionComment(section.label));
      subjects.forEach((subject) => {
        if (mime === 'application/n-triples' || mime === 'application/n-quads') {
          pushNTriplesLikeSubjectBlock(subject);
        } else {
          pushSubjectBlock(subject);
        }
      });
    });

    return `${parts.filter(Boolean).join('\n\n')}\n`;
  };

  const prettify = ({ text, mimeType, baseIRI, logger } = {}) => {
    const mime = normalizeMimeType(mimeType);
    if (!supports(mime)) {
      return { text, applied: false, warnings: [`${mimeType} is not supported by N3SugarSerial.`] };
    }

    try {
      return { text: prettifyN3Like({ text, mimeType: mime, baseIRI }), applied: true, warnings: [] };
    } catch (error) {
      if (logger && logger.warn) logger.warn('N3 sugar serialization skipped:', error);
      return {
        text,
        applied: false,
        warnings: [error && error.message ? error.message : String(error)],
      };
    }
  };

  global.N3SugarSerial = {
    supports,
    supportsInlineComments: supports,
    prettify,
    extractPrefixes,
  };
})(window);
