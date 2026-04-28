/* rdf-serialization-prettifier.js
 * Reusable RDF serialization helper for OWLAPI-inspired output.
 *
 * Exposes window.RdfSerializationPrettifier with:
 * - supportsInlineComments(mimeType)
 * - prettify({ text, mimeType, baseIRI, logger })
 */
(function (global) {
  'use strict';

  const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
  const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
  const OWL = 'http://www.w3.org/2002/07/owl#';
  const XSD = 'http://www.w3.org/2001/XMLSchema#';
  const DC = 'http://purl.org/dc/elements/1.1/';
  const DCTERMS = 'http://purl.org/dc/terms/';
  const SKOS = 'http://www.w3.org/2004/02/skos/core#';

  const RDF_TYPE = `${RDF}type`;
  const RDF_FIRST = `${RDF}first`;
  const RDF_REST = `${RDF}rest`;
  const RDF_NIL = `${RDF}nil`;
  const SECTION_TYPES = Object.freeze([
    { key: 'annotationProperties', label: 'Annotation properties', iri: `${OWL}AnnotationProperty` },
    { key: 'dataProperties', label: 'Datatype properties', iri: `${OWL}DatatypeProperty` },
    { key: 'objectProperties', label: 'Object Properties', iri: `${OWL}ObjectProperty` },
    { key: 'classes', label: 'Classes', iri: `${OWL}Class` },
    { key: 'individuals', label: 'Individuals', iri: `${OWL}NamedIndividual` },
  ]);

  const DEFAULT_PREFIXES = Object.freeze({
    dc: DC,
    dcterms: DCTERMS,
    owl: OWL,
    rdf: RDF,
    rdfs: RDFS,
    skos: SKOS,
    xsd: XSD,
  });

  const normalizeMimeType = (mimeType) => {
    const lower = String(mimeType || '').trim().toLowerCase();
    if (lower === 'ttl' || lower === 'turtle') return 'text/turtle';
    if (lower === 'trig') return 'application/trig';
    if (lower === 'nt' || lower === 'ntriples' || lower === 'n-triples') return 'application/n-triples';
    if (lower === 'nq' || lower === 'nquads' || lower === 'n-quads') return 'application/n-quads';
    if (lower === 'rdf' || lower === 'rdfxml' || lower === 'application/rdf+xml') return 'application/rdf+xml';
    return lower;
  };

  const supportsInlineComments = (mimeType) => {
    const mime = normalizeMimeType(mimeType);
    return [
      'text/turtle',
      'application/trig',
      'application/n-triples',
      'application/n-quads',
      'application/rdf+xml',
    ].includes(mime);
  };

  const n3FormatForMime = (mimeType) => ({
    'application/n-triples': 'N-Triples',
    'application/n-quads': 'N-Quads',
    'application/trig': 'application/trig',
  })[normalizeMimeType(mimeType)];

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

  const getPrefixes = (parsedPrefixes) => {
    const prefixes = Object.assign({}, DEFAULT_PREFIXES);
    Object.keys(parsedPrefixes || {}).forEach((key) => {
      prefixes[key] = asPrefixIri(parsedPrefixes[key]);
    });
    return prefixes;
  };

  const prefixEntries = (prefixes) => Object.entries(prefixes || {})
    .filter(([, iri]) => iri)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

  const namedNodeToText = (iri, prefixes) => {
    const match = prefixEntries(prefixes).find(([prefix, ns]) => {
      if (!iri.startsWith(ns)) return false;
      const local = iri.slice(ns.length);
      return /^[A-Za-z_][A-Za-z0-9._-]*$/.test(local) || (prefix === '' && local);
    });
    if (match) {
      const [prefix, ns] = match;
      return `${prefix ? `${prefix}:` : ':'}${iri.slice(ns.length)}`;
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
      if (!datatype || datatype === `${XSD}string`) return lexical;
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
    if (!N3 || !N3.Parser || !N3.Store) {
      throw new Error('N3 library not available for RDF prettification');
    }

    const store = new N3.Store();
    const prefixes = {};
    const parser = new N3.Parser({
      baseIRI,
      ...(n3FormatForMime(mimeType) ? { format: n3FormatForMime(mimeType) } : {}),
    });

    const quads = parser.parse(text);
    quads.forEach((quad) => store.addQuad(quad));
    Object.assign(prefixes, parser._prefixes || {});
    return { store, prefixes: getPrefixes(prefixes) };
  };

  const sectionComment = (label, mimeType) => {
    if (normalizeMimeType(mimeType) === 'application/rdf+xml') {
      return [
        '    <!-- ',
        '    ///////////////////////////////////////////////////////////////////////////////////////',
        '    //',
        `    // ${label}`,
        '    //',
        '    ///////////////////////////////////////////////////////////////////////////////////////',
        '     -->',
      ].join('\n');
    }
    return [
      '#################################################################',
      `#    ${label}`,
      '#################################################################',
    ].join('\n');
  };

  const subjectHeader = (term, prefixes, mimeType) => {
    const iri = term && term.termType === 'NamedNode' ? term.value : termToText(term, prefixes);
    if (normalizeMimeType(mimeType) === 'application/rdf+xml') return `<!-- ${iri} -->`;
    return `###  ${iri}`;
  };

  const getSubjectTypeIris = (store, subject) => store
    .getQuads(subject, null, null, null)
    .filter((quad) => quad.predicate.value === RDF_TYPE && quad.object.termType === 'NamedNode')
    .map((quad) => quad.object.value);

  const classifySubject = (store, subject) => {
    const typeIris = getSubjectTypeIris(store, subject);
    if (typeIris.includes(`${OWL}Ontology`)) return 'ontology';

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
    if (predicateIri === `${OWL}versionIRI`) return 10;
    if (predicateIri === `${OWL}imports`) return 20;
    if (predicateIri === `${DC}title` || predicateIri === `${DCTERMS}title`) return 30;
    if (predicateIri === `${DC}creator` || predicateIri === `${DCTERMS}creator`) return 40;
    if (predicateIri === `${DC}contributor` || predicateIri === `${DCTERMS}contributor`) return 50;
    if (predicateIri === `${DC}description` || predicateIri === `${DCTERMS}description`) return 60;
    if (predicateIri === `${DCTERMS}license`) return 70;
    if (predicateIri === `${DC}rights` || predicateIri === `${DCTERMS}rights`) return 80;
    if (predicateIri === `${RDFS}comment`) return 90;
    if (predicateIri === `${RDFS}label`) return 100;
    if (predicateIri === `${OWL}versionInfo`) return 110;
    if (predicateIri === `${SKOS}scopeNote`) return 120;
    return 500;
  };

  const predicateRank = (predicateIri, subjectKind) => {
    if (subjectKind === 'ontology') return ontologyPredicateRank(predicateIri);
    if (predicateIri === RDF_TYPE) return 0;

    const owlRank = [
      `${OWL}equivalentClass`,
      `${OWL}disjointWith`,
      `${OWL}complementOf`,
      `${OWL}intersectionOf`,
      `${OWL}unionOf`,
      `${OWL}oneOf`,
      `${OWL}inverseOf`,
      `${OWL}propertyChainAxiom`,
      `${OWL}TransitiveProperty`,
      `${OWL}SymmetricProperty`,
      `${OWL}AsymmetricProperty`,
      `${OWL}ReflexiveProperty`,
      `${OWL}IrreflexiveProperty`,
      `${OWL}FunctionalProperty`,
      `${OWL}InverseFunctionalProperty`,
    ].indexOf(predicateIri);
    if (owlRank >= 0) return 10 + owlRank;

    if (predicateIri === `${RDFS}subClassOf`) return 100;
    if (predicateIri === `${RDFS}subPropertyOf`) return 101;
    if (predicateIri === `${RDFS}domain`) return 120;
    if (predicateIri === `${RDFS}range`) return 121;
    if (predicateIri === `${RDFS}label`) return 200;
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

  const isIgnorableWhitespaceValueQuad = (quad) => {
    return quad &&
      quad.predicate &&
      quad.predicate.value === `${RDF}value` &&
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
    const N3 = global.N3;
    const format = n3FormatForMime(mimeType);
    if (!N3 || !N3.Writer || !format) return '';

    const blocks = [];
    subjects.forEach((subject) => {
      const quads = store.getQuads(subject, null, null, null).slice().sort((a, b) => {
        const predicateCompare = comparePredicates(a.predicate, b.predicate, prefixes);
        if (predicateCompare) return predicateCompare;
        return termSortKey(a.object, prefixes).localeCompare(termSortKey(b.object, prefixes));
      });
      quads.forEach((quad) => {
        const writer = new N3.Writer({ format });
        writer.addQuad(quad);
        writer.end((err, result) => {
          if (!err) blocks.push(result.trim());
        });
      });
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
    const explicitPrefixes = Object.entries(prefixes || {})
      .filter(([, iri]) => iri)
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
    const parsed = parseWithN3(text, mime, baseIRI);
    const { store, prefixes } = parsed;
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
        subjectHeader(subject, prefixes, mime),
        formatTurtleSubject(store, subject, prefixes),
      ].filter(Boolean).join('\n'));
    };

    const pushNTriplesLikeSubjectBlock = (subject) => {
      parts.push([
        subjectHeader(subject, prefixes, mime),
        formatNTriplesLike(store, [subject], prefixes, mime),
      ].filter(Boolean).join('\n'));
    };

    SECTION_TYPES.forEach((section) => {
      const subjects = sections[section.key];
      if (!subjects.length) return;
      parts.push(sectionComment(section.label, mime));
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
      parts.push(sectionComment(section.label, mime));
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

  const elementKey = (node) => {
    const about = node.getAttribute('rdf:about') || node.getAttributeNS(RDF, 'about') || '';
    const resource = node.getAttribute('rdf:resource') || node.getAttributeNS(RDF, 'resource') || '';
    return (about || resource || node.localName || node.nodeName).toLowerCase();
  };

  const escapeXmlText = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const classifyXmlElement = (node) => {
    const name = node.localName || node.nodeName;
    if (name === 'Ontology') return 'ontology';
    if (name === 'AnnotationProperty') return 'annotationProperties';
    if (name === 'ObjectProperty') return 'objectProperties';
    if (name === 'DatatypeProperty') return 'dataProperties';
    if (name === 'Class') return 'classes';
    if (name === 'NamedIndividual') return 'individuals';
    if (name === 'Description') return 'extraAxioms';
    return 'extraAnnotations';
  };

  const formatXml = (node, level) => {
    const serializer = new XMLSerializer();
    const indent = '    '.repeat(level);
    if (node.nodeType === Node.COMMENT_NODE) return `${indent}<!-- ${node.nodeValue.trim()} -->`;
    if (node.nodeType === Node.TEXT_NODE) return `${indent}${escapeXmlText(node.nodeValue.trim())}`;
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const children = Array.from(node.childNodes).filter((child) => {
      return child.nodeType === Node.ELEMENT_NODE || child.nodeType === Node.COMMENT_NODE ||
        (child.nodeType === Node.TEXT_NODE && child.nodeValue.trim());
    });
    if (!children.length) return `${indent}${serializer.serializeToString(node)}`;

    const clone = node.cloneNode(false);
    const open = serializer.serializeToString(clone).replace(/\/>$/, '>');
    const close = `</${node.nodeName}>`;
    const childText = children.map((child) => formatXml(child, level + 1)).filter(Boolean).join('\n');
    return `${indent}${open}\n${childText}\n${indent}${close}`;
  };

  const prettifyRdfXml = ({ text }) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('RDF/XML could not be parsed for prettification');
    const root = doc.documentElement;
    const children = Array.from(root.childNodes).filter((node) => node.nodeType === Node.ELEMENT_NODE);
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

    children.forEach((child) => sections[classifyXmlElement(child)].push(child));
    Object.keys(sections).forEach((key) => sections[key].sort((a, b) => elementKey(a).localeCompare(elementKey(b))));

    const serializer = new XMLSerializer();
    const rootClone = root.cloneNode(false);
    const rootOpen = serializer.serializeToString(rootClone).replace(/\/>$/, '>');
    const parts = ['<?xml version="1.0"?>', rootOpen];

    sections.ontology.forEach((node) => parts.push(formatXml(node, 1)));

    SECTION_TYPES.forEach((section) => {
      if (!sections[section.key].length) return;
      parts.push('', sectionComment(section.label, 'application/rdf+xml'), '');
      sections[section.key].forEach((node) => parts.push(formatXml(node, 1), ''));
    });

    [
      { key: 'extraAnnotations', label: 'Extra annotations' },
      { key: 'extraAxioms', label: 'Extra axioms' },
    ].forEach((section) => {
      if (!sections[section.key].length) return;
      parts.push('', sectionComment(section.label, 'application/rdf+xml'), '');
      sections[section.key].forEach((node) => parts.push(formatXml(node, 1), ''));
    });

    parts.push(`</${root.nodeName}>`);
    return `${parts.join('\n').replace(/\n{4,}/g, '\n\n\n')}\n`;
  };

  const prettify = ({ text, mimeType, baseIRI, logger } = {}) => {
    const mime = normalizeMimeType(mimeType);
    if (!supportsInlineComments(mime)) {
      return { text, applied: false, warnings: [`${mimeType} does not support inline comments.`] };
    }

    try {
      if (mime === 'application/rdf+xml') {
        return { text: prettifyRdfXml({ text }), applied: true, warnings: [] };
      }
      return { text: prettifyN3Like({ text, mimeType: mime, baseIRI }), applied: true, warnings: [] };
    } catch (error) {
      if (logger && logger.warn) logger.warn('RDF prettification skipped:', error);
      return {
        text,
        applied: false,
        warnings: [error && error.message ? error.message : String(error)],
      };
    }
  };

  const api = {
    supportsInlineComments,
    prettify,
  };

  global.RdfSerializationPrettifier = api;
})(window);
