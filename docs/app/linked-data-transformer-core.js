// docs/app/linked-data-transformer-core.js

import { normalizeMimeType } from './linked-data-transformer-registry.js';
import { normalizePrefixMap } from './shared/namespace-registry/prefix-map.js';
import { extractXmlNamespacePrefixes } from './shared/namespace-registry/rdf-prefixes.js';
import {
  createN3WriterOptionsWithPrefixes,
  applyPrefixesToRdflibStore
} from './shared/namespace-registry/rdf-serialization-prefixes.js';
import {
  parseRdfTextWithAdapters,
  serializeRdfDatasetWithAdapters
} from './shared/rdf-io/index.js';

const mimeToN3Format = Object.freeze({
  'application/n-triples': 'N-Triples',
  'application/trig': 'application/trig',
  'application/n-quads': 'N-Quads',
});

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

  function rdflibTermToRdfjs(term, storeForCollections) {
    const DF = N3?.DataFactory;
    if (!DF) throw new Error('N3.DataFactory not available');
    if (!term || !term.termType) throw new Error('Invalid rdflib term');

    const expandCollection = (col) => {
      if (!storeForCollections) {
        throw new Error('storeForCollections is required for rdflib Collection');
      }

      const RDF_NS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
      const rdfFirst = DF.namedNode(`${RDF_NS}first`);
      const rdfRest = DF.namedNode(`${RDF_NS}rest`);
      const rdfNil = DF.namedNode(`${RDF_NS}nil`);

      const elements = Array.isArray(col.elements) ? col.elements : [];
      if (!elements.length) return rdfNil;

      const head = (col.id || col.value)
        ? DF.blankNode(String(col.id || col.value).replace(/^_:/, ''))
        : DF.blankNode();

      let current = head;

      elements.forEach((el, idx) => {
        const item = rdflibTermToRdfjs(el, storeForCollections);
        storeForCollections.addQuad(DF.quad(current, rdfFirst, item));

        const next = (idx === elements.length - 1) ? rdfNil : DF.blankNode();
        storeForCollections.addQuad(DF.quad(current, rdfRest, next));
        current = next;
      });

      return head;
    };

    switch (term.termType) {
      case 'NamedNode':
        return DF.namedNode(term.value);
      case 'BlankNode':
        return DF.blankNode(term.value);
      case 'Literal': {
        const dt = term.datatype?.value || 'http://www.w3.org/2001/XMLSchema#string';
        const lang = term.language || '';
        return lang ? DF.literal(term.value, lang) : DF.literal(term.value, DF.namedNode(dt));
      }
      case 'Collection':
        return expandCollection(term);
      default:
        throw new Error(`Unsupported rdflib termType: ${term.termType}`);
    }
  }

  function rdfjsTermToRdflib(term) {
    if (!$rdf) throw new Error('$rdf not available');
    if (!term || !term.termType) throw new Error('Invalid RDFJS term');

    switch (term.termType) {
      case 'NamedNode':
        return $rdf.sym(term.value);
      case 'BlankNode':
        return $rdf.blankNode(term.value);
      case 'Literal': {
        const lang = term.language || '';
        const dt = term.datatype?.value || 'http://www.w3.org/2001/XMLSchema#string';
        return lang ? $rdf.literal(term.value, lang) : $rdf.literal(term.value, $rdf.sym(dt));
      }
      default:
        throw new Error(`Unsupported RDFJS termType: ${term.termType}`);
    }
  }

  function parseWithN3({ text, n3Format, baseIRI, logger }) {
    const log = ensureLogger(logger);

    try {
      if (!N3?.Parser || !N3?.Store) throw new Error('N3 library not available');

      const store = new N3.Store();
      const prefixes = {};

      const parser = new N3.Parser({
        baseIRI,
        ...(n3Format ? { format: n3Format } : {}),
      });

      const quads = parser.parse(text);
      quads.forEach((quad) => store.addQuad(quad));
      Object.assign(prefixes, normalizePrefixMap(parser._prefixes || {}).prefixes);

      if (store.size === 0 && text.trim().length > 0) {
        log.warn('N3 parse produced 0 quads.');
      }

      log.info(`Parsed with N3 (${n3Format || 'default'}). Quads:`, store.size);
      return { store, prefixes };
    } catch (error) {
      log.error('N3 parse failed:', describeError(error));
      throw error;
    }
  }

  async function parseWithJsonLd({ text, baseIRI, logger }) {
    const log = ensureLogger(logger);

    try {
      if (!jsonld) throw new Error('jsonld library not available');

      const doc = JSON.parse(text);
      const nquads = await jsonld.toRDF(doc, { format: 'application/n-quads' }).catch(() =>
        jsonld.toRDF(doc, { format: 'application/nquads' })
      );

      const { store } = parseWithN3({
        text: nquads,
        n3Format: 'N-Quads',
        baseIRI,
        logger: log,
      });

      return { store, prefixes: {} };
    } catch (error) {
      log.error('JSON-LD parse failed:', describeError(error));
      throw error;
    }
  }

  async function parseWithRdflibXml({ text, baseIRI, logger }) {
    const log = ensureLogger(logger);

    try {
      if (!$rdf) throw new Error('rdflib ($rdf) not available');
      if (!N3?.Store || !N3?.DataFactory) throw new Error('N3 library not available');

      const graph = $rdf.graph();
      const rdfXmlText = globalThis.RdflibSugarSerial?.repairInput
        ? globalThis.RdflibSugarSerial.repairInput({ text, mimeType: 'application/rdf+xml', baseIRI })
        : repairRdfXmlUnqualifiedElements({ text, baseIRI });

      await new Promise((resolve, reject) => {
        try {
          $rdf.parse(rdfXmlText, graph, baseIRI, 'application/rdf+xml', (err) => {
            if (err) reject(err);
            else resolve(true);
          });
        } catch (e) {
          reject(e);
        }
      });

      const store = new N3.Store();

      graph.statements.forEach((st) => {
        const s = rdflibTermToRdfjs(st.subject, store);
        const p = rdflibTermToRdfjs(st.predicate, store);
        const o = rdflibTermToRdfjs(st.object, store);
        store.addQuad(N3.DataFactory.quad(s, p, o));
      });

      const prefixes = extractRdfXmlPrefixes(text);
      log.info('Parsed RDF/XML via rdflib. Quads:', store.size);
      return { store, prefixes };
    } catch (error) {
      if (/No namespace for html\b/i.test(error?.message || String(error))) {
        throw new Error('RDF/XML parse failed on an unqualified <html> element. If this is BFO-2020.owl from a browser or GitHub page, download the raw .owl file. If it is XML-literal markup inside RDF/XML, refresh the tool so the RDFLib sugar repair module is loaded.');
      }
      log.error('RDF/XML parse failed:', describeError(error));
      throw error;
    }
  }

  async function parseToStore({ text, inputMime, baseIRI, logger }) {
    const mime = normalizeMimeType(inputMime);
    const log = ensureLogger(logger);

    try {
      const parsed = await parseRdfTextWithAdapters(text, {
        format: mime,
        baseIri: baseIRI,
        runtime: { N3, jsonld, $rdf }
      });
      log.info(`Parsed with shared RDF adapter (${mime}). Quads:`, parsed.quads.length);
      return {
        store: parsed.dataset,
        prefixes: parsed.prefixes || {},
        sourceFormat: mime
      };
    } catch (error) {
      if (mime !== 'application/rdf+xml') throw error;
      log.warn('Shared RDF/XML adapter failed; trying Visual Lynx repair-aware RDF/XML parser.', describeError(error));
    }

    if (mime === 'application/ld+json') {
      return parseWithJsonLd({ text, baseIRI, logger });
    }
    if (mime === 'application/rdf+xml') {
      return parseWithRdflibXml({ text, baseIRI, logger });
    }
    if (mime === 'text/turtle' || mimeToN3Format[mime]) {
      return parseWithN3({
        text,
        n3Format: mimeToN3Format[mime],
        baseIRI,
        logger,
      });
    }

    throw new Error(`Unsupported input MIME: ${inputMime}`);
  }

  async function serializeWithN3({ store, outputMime, prefixes, logger }) {
    const log = ensureLogger(logger);

    try {
      if (!N3?.Writer) throw new Error('N3.Writer not available');

      const format = (outputMime === 'text/turtle') ? undefined : mimeToN3Format[outputMime];
      if (outputMime !== 'text/turtle' && !format) {
        throw new Error(`Unsupported N3 output MIME: ${outputMime}`);
      }

      const writer = format ? new N3.Writer({ format }) : new N3.Writer();

      if ((outputMime === 'text/turtle' || outputMime === 'application/trig') &&
          prefixes &&
          Object.keys(prefixes).length) {
        writer.addPrefixes(createN3WriterOptionsWithPrefixes({ prefixes }).value.prefixes);
      }

      writer.addQuads(store.getQuads(null, null, null, null));

      const out = await new Promise((resolve, reject) => {
        writer.end((err, result) => (err ? reject(err) : resolve(result)));
      });

      log.info(`Serialized with N3 (${format || 'default'}). Bytes:`, out.length);
      return out;
    } catch (error) {
      log.error('N3 serialization failed:', describeError(error));
      throw error;
    }
  }

  async function serializeToJsonLd({ store, logger }) {
    const log = ensureLogger(logger);

    try {
      if (!jsonld) throw new Error('jsonld library not available');

      const nquads = await serializeWithN3({
        store,
        outputMime: 'application/n-quads',
        prefixes: {},
        logger: log,
      });

      const doc = await jsonld.fromRDF(nquads, { format: 'application/n-quads' }).catch(() =>
        jsonld.fromRDF(nquads, { format: 'application/nquads' })
      );

      return JSON.stringify(doc, null, 2);
    } catch (error) {
      log.error('JSON-LD serialization failed:', describeError(error));
      throw error;
    }
  }

  async function serializeToRdfXml({ store, prefixes, baseIRI, logger }) {
    const log = ensureLogger(logger);

    try {
      if (!$rdf) throw new Error('rdflib ($rdf) not available');

      const graph = $rdf.graph();
      applyPrefixesToRdflibStore(graph, prefixes || {});

      store.getQuads(null, null, null, null).forEach((q) => {
        graph.add(
          rdfjsTermToRdflib(q.subject),
          rdfjsTermToRdflib(q.predicate),
          rdfjsTermToRdflib(q.object)
        );
      });

      const xml = await new Promise((resolve, reject) => {
        try {
          $rdf.serialize(null, graph, baseIRI, 'application/rdf+xml', (err, str) => {
            if (err) reject(err);
            else resolve(str);
          });
        } catch (e) {
          reject(e);
        }
      });

      return xml;
    } catch (error) {
      log.error('RDF/XML serialization failed:', describeError(error));
      throw error;
    }
  }

  function storeToD3({ store }) {
    const nodesById = new Map();
    const links = [];

    const termId = (t) => `${t.termType}:${t.value}`;

    store.getQuads(null, null, null, null).forEach((q) => {
      const sId = termId(q.subject);
      const oId = termId(q.object);

      if (!nodesById.has(sId)) {
        nodesById.set(sId, {
          id: sId,
          value: q.subject.value,
          termType: q.subject.termType,
        });
      }
      if (!nodesById.has(oId)) {
        nodesById.set(oId, {
          id: oId,
          value: q.object.value,
          termType: q.object.termType,
        });
      }

      links.push({
        source: sId,
        target: oId,
        predicate: q.predicate.value,
      });
    });

    return { nodes: Array.from(nodesById.values()), links };
  }

  function storeToMermaid({ store }) {
    const esc = (s) => String(s).replace(/"/g, '\\"');

    const termLabel = (t) => {
      if (t.termType === 'NamedNode') return esc(t.value);
      if (t.termType === 'BlankNode') return `_:${esc(t.value)}`;
      return `"${esc(t.value)}"`;
    };

    const lines = ['graph TD'];
    let i = 0;

    store.getQuads(null, null, null, null).forEach((q) => {
      const s = `S${i}`;
      const o = `O${i}`;
      lines.push(`${s}["${termLabel(q.subject)}"] -->|${esc(q.predicate.value)}| ${o}["${termLabel(q.object)}"]`);
      i += 1;
    });

    return lines.join('\n');
  }

  async function serializeFromStore({ store, outputMime, prefixes, baseIRI, logger }) {
    const mime = normalizeMimeType(outputMime);

    if (mime === 'application/ld+json' || mime === 'application/rdf+xml' || mime === 'text/turtle' || mimeToN3Format[mime]) {
      try {
        const serialized = await serializeRdfDatasetWithAdapters(store, {
          format: mime,
          prefixes,
          baseIri: baseIRI,
          runtime: { N3, jsonld, $rdf }
        });
        return serialized.text;
      } catch (error) {
        if (mime !== 'application/rdf+xml') throw error;
        ensureLogger(logger).warn('Shared RDF/XML serializer failed; trying Visual Lynx local serializer.', describeError(error));
      }
    }

    if (mime === 'application/ld+json') {
      return serializeToJsonLd({ store, logger });
    }
    if (mime === 'application/rdf+xml') {
      return serializeToRdfXml({ store, prefixes, baseIRI, logger });
    }
    if (mime === 'text/turtle' || mimeToN3Format[mime]) {
      return serializeWithN3({ store, outputMime: mime, prefixes, logger });
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
