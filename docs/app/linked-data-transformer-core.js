// docs/app/linked-data-transformer-core.js

import { normalizeMimeType } from './linked-data-transformer-registry.js';
import { COMMON_NAMESPACE_IRIS } from './shared/namespace-registry/namespace-registry.js';
import { normalizePrefixMap } from './shared/namespace-registry/prefix-map.js';
import { extractXmlNamespacePrefixes } from './shared/namespace-registry/rdf-prefixes.js';
import {
  parseRdfTextWithAdapters,
  serializeRdfDatasetWithAdapters
} from './shared/rdf-io/index.js';

const NS = COMMON_NAMESPACE_IRIS;

function defaultLogger() {
  return {
    info() {},
    warn() {},
    error() {},
  };
}

function describeError(err) {
  try {
    if (err instanceof Error) {
      return { name: err.name, message: err.message, stack: err.stack };
    }
    if (typeof err === 'string') {
      return { name: 'Error', message: err, stack: '' };
    }
    if (err && typeof err === 'object') {
      return {
        name: err.name ? String(err.name) : 'Error',
        message: err.message ? String(err.message) : JSON.stringify(err),
        stack: err.stack ? String(err.stack) : '',
      };
    }
    return { name: 'Error', message: String(err), stack: '' };
  } catch {
    return { name: 'Error', message: 'Unprintable error', stack: '' };
  }
}

function extractRdfXmlPrefixes(text) {
  return normalizePrefixMap(extractXmlNamespacePrefixes(text)).prefixes;
}

function normalizeNamespaceIri(iri) {
  const text = String(iri || '').trim();
  if (!text) return '';
  return /[#/]$/.test(text) ? text : `${text}#`;
}

function repairRdfXmlUnqualifiedElements({ text, baseIRI }) {
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') return text;

  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) return text;

  const root = doc.documentElement;
  if (!root) return text;

  const namespaceIri = normalizeNamespaceIri(baseIRI);
  if (!namespaceIri) return text;

  let prefix = 'base';
  let suffix = 0;
  while (root.getAttribute(`xmlns:${prefix}`) && root.getAttribute(`xmlns:${prefix}`) !== namespaceIri) {
    suffix += 1;
    prefix = `base${suffix}`;
  }

  let changed = false;
  const replacementFor = (node) => {
    const replacement = doc.createElementNS(namespaceIri, `${prefix}:${node.nodeName}`);

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

  root.setAttribute(`xmlns:${prefix}`, namespaceIri);
  return new XMLSerializer().serializeToString(doc);
}

export function createTransformer({ N3, jsonld, $rdf }) {
  function ensureLogger(logger) {
    return logger || defaultLogger();
  }

  async function parseToStore({ text, inputMime, baseIRI, logger }) {
    const mime = normalizeMimeType(inputMime);
    const log = ensureLogger(logger);
    const rdfText = mime === 'application/rdf+xml'
      ? (globalThis.RdflibSugarSerial?.repairInput
        ? globalThis.RdflibSugarSerial.repairInput({ text, mimeType: 'application/rdf+xml', baseIRI })
        : repairRdfXmlUnqualifiedElements({ text, baseIRI }))
      : text;
    const parsed = await parseRdfTextWithAdapters(rdfText, {
      format: mime,
      baseIri: baseIRI,
      runtime: { N3, jsonld, $rdf }
    });
    const rdfXmlPrefixes = mime === 'application/rdf+xml' ? extractRdfXmlPrefixes(text) : {};
    log.info(`Parsed with shared RDF adapter (${mime}). Quads:`, parsed.quads.length);
    return {
      store: parsed.dataset,
      prefixes: { ...rdfXmlPrefixes, ...(parsed.prefixes || {}) },
      sourceFormat: mime
    };
  }

  function storeToD3({ store }) {
    const nodesById = new Map();
    const links = [];

    const termId = (term) => `${term.termType}:${term.value}`;

    store.getQuads(null, null, null, null).forEach((quad) => {
      const subjectId = termId(quad.subject);
      const objectId = termId(quad.object);

      if (!nodesById.has(subjectId)) {
        nodesById.set(subjectId, {
          id: subjectId,
          value: quad.subject.value,
          termType: quad.subject.termType,
        });
      }
      if (!nodesById.has(objectId)) {
        nodesById.set(objectId, {
          id: objectId,
          value: quad.object.value,
          termType: quad.object.termType,
        });
      }

      links.push({
        source: subjectId,
        target: objectId,
        predicate: quad.predicate.value,
      });
    });

    return { nodes: Array.from(nodesById.values()), links };
  }

  function storeToMermaid({ store }) {
    const escapeLabel = (value) => String(value).replace(/"/g, '\\"');

    const termLabel = (term) => {
      if (term.termType === 'NamedNode') return escapeLabel(term.value);
      if (term.termType === 'BlankNode') return `_:${escapeLabel(term.value)}`;
      return `"${escapeLabel(term.value)}"`;
    };

    const lines = ['graph TD'];
    let index = 0;

    store.getQuads(null, null, null, null).forEach((quad) => {
      const subjectId = `S${index}`;
      const objectId = `O${index}`;
      lines.push(`${subjectId}["${termLabel(quad.subject)}"] -->|${escapeLabel(quad.predicate.value)}| ${objectId}["${termLabel(quad.object)}"]`);
      index += 1;
    });

    return lines.join('\n');
  }

  async function serializeFromStore({ store, outputMime, prefixes, baseIRI, logger }) {
    const mime = normalizeMimeType(outputMime);

    if (mime === 'application/ld+json' || mime === 'application/rdf+xml' || mime === 'text/turtle' || mime === 'application/n-triples' || mime === 'application/n-quads' || mime === 'application/trig' || mime === 'text/n3') {
      const serialized = await serializeRdfDatasetWithAdapters(store, {
        format: mime,
        prefixes,
        baseIri: baseIRI,
        runtime: { N3, jsonld, $rdf }
      });
      ensureLogger(logger).info(`Serialized with shared RDF adapter (${mime}). Bytes:`, serialized.text.length);
      return serialized.text;
    }
    if (mime === 'text/mermaid') {
      return storeToMermaid({ store });
    }
    if (mime === 'application/d3+json') {
      return JSON.stringify(storeToD3({ store }), null, 2);
    }

    throw new Error(`Unsupported output MIME: ${outputMime}`);
  }

  async function transformText({ text, inputMime, outputMime, baseIRI = 'http://example.org/', logger }) {
    const log = ensureLogger(logger);

    try {
      if (!text) throw new Error('No input text provided');
      if (!inputMime) throw new Error('No input format selected');
      if (!outputMime) throw new Error('No output format selected');

      const { store, prefixes } = await parseToStore({
        text,
        inputMime,
        baseIRI,
        logger: log,
      });

      return serializeFromStore({
        store,
        outputMime,
        prefixes,
        baseIRI,
        logger: log,
      });
    } catch (error) {
      log.error('Transformation failed:', describeError(error));
      throw error;
    }
  }

  return {
    transformText,
    parseToStore,
    serializeFromStore,
    storeToD3,
    storeToMermaid,
  };
}
