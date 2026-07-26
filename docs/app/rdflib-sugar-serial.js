/* rdflib-sugar-serial.js
 * Syntactic sugar for RDFLib-backed RDF/XML serialization.
 *
 * Exposes window.RdflibSugarSerial with:
 * - supports(mimeType)
 * - supportsInlineComments(mimeType)
 * - repairInput({ text, mimeType, baseIRI })
 * - prettify({ text, mimeType, sourceText, sourceMimeType, baseIRI, logger })
 * - extractPrefixes({ text, mimeType })
 */
import { namespacePrefixMapFromRegistry } from './shared/namespace-registry/namespace-registry.js';
import {
  extractTurtlePrefixDeclarations,
  extractXmlNamespacePrefixes
} from './shared/namespace-registry/rdf-prefixes.js';
import { normalizePrefixMap } from './shared/namespace-registry/prefix-map.js';

(function (global) {
  'use strict';

  const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
  const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
  const OWL = 'http://www.w3.org/2002/07/owl#';
  const XSD = 'http://www.w3.org/2001/XMLSchema#';
  const XHTML = 'http://www.w3.org/1999/xhtml';
  const DC = 'http://purl.org/dc/elements/1.1/';
  const DCTERMS = 'http://purl.org/dc/terms/';
  const SKOS = 'http://www.w3.org/2004/02/skos/core#';

  const SECTION_TYPES = Object.freeze([
    { key: 'annotationProperties', label: 'Annotation properties', iri: `${OWL}AnnotationProperty` },
    { key: 'dataProperties', label: 'Datatype properties', iri: `${OWL}DatatypeProperty` },
    { key: 'objectProperties', label: 'Object Properties', iri: `${OWL}ObjectProperty` },
    { key: 'classes', label: 'Classes', iri: `${OWL}Class` },
    { key: 'individuals', label: 'Individuals', iri: `${OWL}NamedIndividual` },
  ]);

  const DEFAULT_PREFIXES = namespacePrefixMapFromRegistry();

  const HTML_LITERAL_ELEMENTS = new Set([
    'a',
    'abbr',
    'blockquote',
    'br',
    'code',
    'dd',
    'div',
    'dl',
    'dt',
    'em',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'html',
    'i',
    'li',
    'ol',
    'p',
    'pre',
    'span',
    'strong',
    'sub',
    'sup',
    'table',
    'tbody',
    'td',
    'th',
    'thead',
    'tr',
    'ul',
  ]);

  const normalizeMimeType = (mimeType) => {
    const lower = String(mimeType || '').trim().toLowerCase();
    if (lower === 'rdf' || lower === 'rdfxml' || lower === 'application/rdf+xml') return 'application/rdf+xml';
    if (lower === 'ttl' || lower === 'turtle') return 'text/turtle';
    if (lower === 'trig') return 'application/trig';
    return lower;
  };

  const supports = (mimeType) => normalizeMimeType(mimeType) === 'application/rdf+xml';

  const normalizeLiteralValue = (value) => {
    const text = String(value);
    if (!/[\r\n]/.test(text)) return text;
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join(' ');
  };

  const extractTurtlePrefixes = (text) => {
    return extractTurtlePrefixDeclarations(text);
  };

  const extractRdfXmlPrefixes = (text) => {
    return normalizePrefixMap(extractXmlNamespacePrefixes(text)).prefixes;
  };

  const extractPrefixes = ({ text, mimeType } = {}) => {
    const mime = normalizeMimeType(mimeType);
    if (mime === 'application/rdf+xml') return extractRdfXmlPrefixes(text);
    if (mime === 'text/turtle' || mime === 'application/trig') return extractTurtlePrefixes(text);
    return {};
  };

  const sectionComment = (label) => [
    '    <!-- ',
    '    ///////////////////////////////////////////////////////////////////////////////////////',
    '    //',
    `    // ${label}`,
    '    //',
    '    ///////////////////////////////////////////////////////////////////////////////////////',
    '     -->',
  ].join('\n');

  const elementKey = (node) => {
    const about = node.getAttribute('rdf:about') || node.getAttributeNS(RDF, 'about') || '';
    const resource = node.getAttribute('rdf:resource') || node.getAttributeNS(RDF, 'resource') || '';
    return (about || resource || node.localName || node.nodeName).toLowerCase();
  };

  const escapeXmlText = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const xmlEscapeAttribute = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const collectNamespaceDeclarations = (root) => {
    const namespaces = new Map();
    const visit = (node) => {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) return;

      if (node.prefix && node.namespaceURI) namespaces.set(node.prefix, node.namespaceURI);

      Array.from(node.attributes || []).forEach((attr) => {
        if (attr.name === 'xmlns') namespaces.set('', attr.value);
        else if (attr.name.startsWith('xmlns:')) namespaces.set(attr.name.slice(6), attr.value);
        else if (attr.prefix && attr.namespaceURI) namespaces.set(attr.prefix, attr.namespaceURI);
      });

      Array.from(node.childNodes || []).forEach(visit);
    };

    visit(root);
    return namespaces;
  };

  const preferredPrefixMap = (serializedNamespaces, sourcePrefixes) => {
    const byIri = new Map();
    Object.entries(DEFAULT_PREFIXES).forEach(([prefix, iri]) => byIri.set(iri, prefix));
    Object.entries(sourcePrefixes || {}).forEach(([prefix, iri]) => {
      if (prefix && iri) byIri.set(iri, prefix);
    });

    const preferredNamespaces = new Map();
    const aliases = new Map();

    serializedNamespaces.forEach((iri, prefix) => {
      const preferred = byIri.get(iri) || prefix;
      preferredNamespaces.set(preferred, iri);
      if (prefix && preferred && prefix !== preferred) aliases.set(prefix, preferred);
    });

    Object.entries(sourcePrefixes || {}).forEach(([prefix, iri]) => {
      if (prefix && iri) preferredNamespaces.set(prefix, iri);
    });

    Object.entries(DEFAULT_PREFIXES).forEach(([prefix, iri]) => {
      const alreadyNamed = Array.from(preferredNamespaces.values()).some((existingIri) => existingIri === iri);
      if (!alreadyNamed && !preferredNamespaces.has(prefix)) preferredNamespaces.set(prefix, iri);
    });

    return { aliases, preferredNamespaces };
  };

  const rewriteXmlName = (name, aliases) => {
    const text = String(name || '');
    const colonIndex = text.indexOf(':');
    if (colonIndex < 0) return text;
    const prefix = text.slice(0, colonIndex);
    const local = text.slice(colonIndex + 1);
    return aliases.has(prefix) ? `${aliases.get(prefix)}:${local}` : text;
  };

  const rewriteXmlPrefixes = (xml, aliases) => {
    let result = String(xml || '');
    aliases.forEach((preferred, current) => {
      if (!current || !preferred || current === preferred) return;
      const escaped = current.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result
        .replace(new RegExp(`(<\\/?|\\s)${escaped}:`, 'g'), `$1${preferred}:`)
        .replace(new RegExp(`xmlns:${escaped}=`, 'g'), `xmlns:${preferred}=`);
    });
    return result;
  };

  const removeNamespaceAttributes = (node) => {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
    Array.from(node.attributes || []).forEach((attr) => {
      if (attr.name === 'xmlns' || attr.name.startsWith('xmlns:')) {
        node.removeAttribute(attr.name);
      }
    });
    Array.from(node.childNodes || []).forEach(removeNamespaceAttributes);
  };

  const getRdfAttribute = (node, localName) => {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return '';
    return node.getAttribute(`rdf:${localName}`) || node.getAttributeNS(RDF, localName) || '';
  };

  const removeRdfAttribute = (node, localName) => {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
    node.removeAttribute(`rdf:${localName}`);
    node.removeAttributeNS(RDF, localName);
  };

  const meaningfulChildren = (node) => Array.from(node.childNodes || []).filter((child) => {
    return child.nodeType === Node.ELEMENT_NODE || child.nodeType === Node.COMMENT_NODE ||
      (child.nodeType === Node.TEXT_NODE && child.nodeValue.trim());
  });

  const isTypedBlankNodeElement = (node) => {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    if (node.namespaceURI === RDF && node.localName === 'Description') return true;
    return node.namespaceURI === OWL && [
      'Class',
      'Restriction',
      'Ontology',
      'AnnotationProperty',
      'ObjectProperty',
      'DatatypeProperty',
      'NamedIndividual',
    ].includes(node.localName);
  };

  const repairParseTypeResourceTypedNodes = (node) => {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return;

    const parseType = getRdfAttribute(node, 'parseType');
    const children = meaningfulChildren(node);
    const elementChildren = children.filter((child) => child.nodeType === Node.ELEMENT_NODE);

    if (parseType === 'Resource' && children.length === 1 && isTypedBlankNodeElement(elementChildren[0])) {
      removeRdfAttribute(node, 'parseType');
    }

    Array.from(node.childNodes || []).forEach(repairParseTypeResourceTypedNodes);
  };

  const applyNamespaceDeclarations = (root, namespaces) => {
    namespaces.forEach((iri, prefix) => {
      if (!iri) return;
      if (prefix) root.setAttribute(`xmlns:${prefix}`, iri);
      else root.setAttribute('xmlns', iri);
    });
  };

  const normalizeNamespaceIri = (iri) => {
    const text = String(iri || '').trim();
    if (!text) return '';
    return /[#/]$/.test(text) ? text : `${text}#`;
  };

  const looksLikeHtmlDocument = (text, root) => {
    const source = String(text || '').trimStart().slice(0, 500).toLowerCase();
    const rootName = String(root && (root.localName || root.nodeName) || '').toLowerCase();
    return rootName === 'html' || source.startsWith('<!doctype html') || source.startsWith('<html');
  };

  const hasParseTypeLiteralAncestor = (node) => {
    let current = node && node.parentNode;
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      const parseType = current.getAttribute('rdf:parseType') || current.getAttributeNS(RDF, 'parseType') || '';
      if (parseType === 'Literal') return true;
      current = current.parentNode;
    }
    return false;
  };

  const chooseUnqualifiedElementNamespace = (namespaces, baseIRI) => {
    const namespaceIri = normalizeNamespaceIri(baseIRI);
    if (!namespaceIri) return null;

    const existing = Array.from(namespaces.entries()).find(([, iri]) => iri === namespaceIri);
    if (existing && existing[0]) return { prefix: existing[0], iri: namespaceIri };

    const prefix = namespaces.has('base') ? 'base0' : 'base';
    namespaces.set(prefix, namespaceIri);
    return { prefix, iri: namespaceIri };
  };

  const formatXmlAttributes = (node, aliases, options = {}) => {
    const includeNamespaces = !!options.includeNamespaces;
    return Array.from(node.attributes || [])
      .filter((attr) => includeNamespaces || (attr.name !== 'xmlns' && !attr.name.startsWith('xmlns:')))
      .map((attr) => `${rewriteXmlName(attr.name, aliases)}="${xmlEscapeAttribute(attr.value)}"`)
      .join(' ');
  };

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

  const formatXml = (node, level, aliases = new Map(), options = {}) => {
    const indent = '    '.repeat(level);
    if (node.nodeType === Node.COMMENT_NODE) return `${indent}<!-- ${node.nodeValue.trim()} -->`;
    if (node.nodeType === Node.TEXT_NODE) return `${indent}${escapeXmlText(node.nodeValue.trim())}`;
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const children = Array.from(node.childNodes).filter((child) => {
      return child.nodeType === Node.ELEMENT_NODE || child.nodeType === Node.COMMENT_NODE ||
        (child.nodeType === Node.TEXT_NODE && child.nodeValue.trim());
    });
    const shouldPrefixUnqualified = !node.prefix && !node.namespaceURI && level > 0 && options.unqualifiedElementPrefix;
    const nodeName = shouldPrefixUnqualified
      ? `${options.unqualifiedElementPrefix}:${node.nodeName}`
      : rewriteXmlName(node.nodeName, aliases);
    const attrs = formatXmlAttributes(node, aliases);
    const open = attrs ? `<${nodeName} ${attrs}>` : `<${nodeName}>`;
    if (!children.length) return attrs ? `${indent}<${nodeName} ${attrs}/>` : `${indent}<${nodeName}/>`;

    if (children.every((child) => child.nodeType === Node.TEXT_NODE)) {
      const text = normalizeLiteralValue(children.map((child) => child.nodeValue).join(''));
      return `${indent}${open}${escapeXmlText(text)}</${nodeName}>`;
    }

    const close = `</${nodeName}>`;
    const childText = children.map((child) => formatXml(child, level + 1, aliases, options)).filter(Boolean).join('\n');
    return `${indent}${open}\n${childText}\n${indent}${close}`;
  };

  const repairInput = ({ text, mimeType, baseIRI } = {}) => {
    if (!supports(mimeType)) return text;
    if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') return text;

    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror')) return text;

    const root = doc.documentElement;
    if (!root) return text;

    if (looksLikeHtmlDocument(text, root)) {
      throw new Error('The selected RDF/XML input appears to be an HTML page, not an ontology document. Download the raw .owl/.rdf file and try again.');
    }

    const baseNamespaceIri = normalizeNamespaceIri(baseIRI);
    if (!baseNamespaceIri) return text;

    const namespacePrefixes = new Map();
    const ensurePrefix = (iri, preferredPrefix) => {
      if (namespacePrefixes.has(iri)) return namespacePrefixes.get(iri);

      let prefix = preferredPrefix;
      let suffix = 0;
      while (root.getAttribute(`xmlns:${prefix}`) && root.getAttribute(`xmlns:${prefix}`) !== iri) {
        suffix += 1;
        prefix = `${preferredPrefix}${suffix}`;
      }

      namespacePrefixes.set(iri, prefix);
      return prefix;
    };

    const namespaceFor = (node) => {
      const localName = String(node.localName || node.nodeName || '').toLowerCase();
      if (hasParseTypeLiteralAncestor(node) && HTML_LITERAL_ELEMENTS.has(localName)) {
        return { iri: XHTML, prefix: ensurePrefix(XHTML, 'xhtml') };
      }
      return { iri: baseNamespaceIri, prefix: ensurePrefix(baseNamespaceIri, 'base') };
    };

    let changed = false;
    const replacementFor = (node) => {
      const namespace = namespaceFor(node);
      const replacement = doc.createElementNS(namespace.iri, `${namespace.prefix}:${node.nodeName}`);

      Array.from(node.attributes || []).forEach((attr) => {
        if (attr.namespaceURI) {
          replacement.setAttributeNS(attr.namespaceURI, attr.name, attr.value);
        } else {
          replacement.setAttribute(attr.name, attr.value);
        }
      });

      while (node.firstChild) replacement.appendChild(node.firstChild);
      return replacement;
    };

    const visit = (node) => {
      Array.from(node.childNodes || []).forEach((child) => {
        if (child.nodeType !== Node.ELEMENT_NODE) return;

        if (!child.prefix && !child.namespaceURI) {
          const replacement = replacementFor(child);
          child.parentNode.replaceChild(replacement, child);
          changed = true;
          visit(replacement);
        } else {
          visit(child);
        }
      });
    };

    visit(root);
    if (!changed) return text;

    namespacePrefixes.forEach((prefix, iri) => {
      root.setAttribute(`xmlns:${prefix}`, iri);
    });
    return new XMLSerializer().serializeToString(doc);
  };

  const prettifyRdfXml = ({ text, sourceText, sourceMimeType, baseIRI }) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('RDF/XML could not be parsed for prettification');
    const root = doc.documentElement;
    const namespaces = collectNamespaceDeclarations(root);
    const sourcePrefixes = extractPrefixes({ text: sourceText, mimeType: sourceMimeType });
    const { aliases, preferredNamespaces } = preferredPrefixMap(namespaces, sourcePrefixes);
    const unqualifiedElementNamespace = chooseUnqualifiedElementNamespace(preferredNamespaces, baseIRI);
    repairParseTypeResourceTypedNodes(root);
    removeNamespaceAttributes(root);
    applyNamespaceDeclarations(root, preferredNamespaces);

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

    const rootName = rewriteXmlName(root.nodeName, aliases);
    const rootAttrs = formatXmlAttributes(root, aliases, { includeNamespaces: true });
    const rootOpen = rootAttrs ? `<${rootName} ${rootAttrs}>` : `<${rootName}>`;
    const parts = ['<?xml version="1.0"?>', rootOpen];

    const formatOptions = {
      unqualifiedElementPrefix: unqualifiedElementNamespace && unqualifiedElementNamespace.prefix,
    };

    sections.ontology.forEach((node) => parts.push(formatXml(node, 1, aliases, formatOptions)));

    SECTION_TYPES.forEach((section) => {
      if (!sections[section.key].length) return;
      parts.push('', sectionComment(section.label), '');
      sections[section.key].forEach((node) => parts.push(formatXml(node, 1, aliases, formatOptions), ''));
    });

    [
      { key: 'extraAnnotations', label: 'Extra annotations' },
      { key: 'extraAxioms', label: 'Extra axioms' },
    ].forEach((section) => {
      if (!sections[section.key].length) return;
      parts.push('', sectionComment(section.label), '');
      sections[section.key].forEach((node) => parts.push(formatXml(node, 1, aliases, formatOptions), ''));
    });

    parts.push(`</${rootName}>`);
    return `${rewriteXmlPrefixes(parts.join('\n').replace(/\n{4,}/g, '\n\n\n'), aliases)}\n`;
  };

  const prettify = ({ text, mimeType, sourceText, sourceMimeType, baseIRI, logger } = {}) => {
    const mime = normalizeMimeType(mimeType);
    if (!supports(mime)) {
      return { text, applied: false, warnings: [`${mimeType} is not supported by RdflibSugarSerial.`] };
    }

    try {
      return { text: prettifyRdfXml({ text, sourceText, sourceMimeType, baseIRI }), applied: true, warnings: [] };
    } catch (error) {
      if (logger && logger.warn) logger.warn('RDFLib sugar serialization skipped:', error);
      return {
        text,
        applied: false,
        warnings: [error && error.message ? error.message : String(error)],
      };
    }
  };

  global.RdflibSugarSerial = {
    supports,
    supportsInlineComments: supports,
    repairInput,
    prettify,
    extractPrefixes,
  };
})(window);
