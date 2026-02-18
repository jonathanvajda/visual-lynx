
/* linked-data-transformer-functions.hybrid.js
 * Hybrid RDF transformer (client-side):
 * - N3.js for Turtle / N-Triples / TriG (+ N-Quads bridging)
 * - jsonld.js for JSON-LD (via N-Quads bridging)
 * - rdflib.js ONLY for RDF/XML + OWL/XML parsing/serialization
 *
 * This file assumes the HTML uses:
 *   #fileInput, #transformBtn, #downloadBtn, #outputArea
 *   input radios: name="input"
 *   output radios: name="output"
 */

/* ------------------------- Logging helpers ------------------------- */
/** Create a structured logger (info/warn/error). */
const makeLogger = (scope = 'ldt') => ({
  info: (...args) => console.info(`[${scope}]`, ...args),
  warn: (...args) => console.warn(`[${scope}]`, ...args),
  error: (...args) => console.error(`[${scope}]`, ...args),
});

/* ------------------------- Format registry ------------------------- */
/** Normalize OWL/XML to RDF/XML for parsing/serialization. */
const normalizeMimeType = (mimeType) =>
  mimeType === 'application/owl+xml' ? 'application/rdf+xml' : mimeType;

/** Map file extensions to MIME types for auto-selection. */
const extensionToMime = Object.freeze({
  '.nt': 'application/n-triples',
  '.ttl': 'text/turtle',
  '.turtle': 'text/turtle',
  '.trig': 'application/trig',
  '.jsonld': 'application/ld+json',
  '.json-ld': 'application/ld+json',
  '.rdf': 'application/rdf+xml',
  '.owl': 'application/owl+xml',
  '.xml': 'application/rdf+xml', // best-effort; RDF/XML or OWL/XML
});

/** Map MIME types to N3.js Parser/Writer format strings. */
const mimeToN3Format = Object.freeze({
  'application/n-triples': 'N-Triples',
  'text/turtle': 'Turtle',
  'application/trig': 'TriG',
  'application/n-quads': 'N-Quads',
});

/* ------------------------- RDF term conversions ------------------------- */
/** Convert an rdflib.js term to an RDFJS term using N3 DataFactory. */
const rdflibTermToRdfjs = (term) => {
  const DF = (window.N3 && window.N3.DataFactory) ? window.N3.DataFactory : null;
  if (!DF) throw new Error('N3.DataFactory not found (is n3 loaded?)');

  if (!term || !term.termType) throw new Error('Invalid rdflib term');

  switch (term.termType) {
    case 'NamedNode':
      return DF.namedNode(term.value);
    case 'BlankNode':
      return DF.blankNode(term.value);
    case 'Literal': {
      const dt = term.datatype && term.datatype.value ? term.datatype.value : 'http://www.w3.org/2001/XMLSchema#string';
      const lang = term.language || '';
      return lang ? DF.literal(term.value, lang) : DF.literal(term.value, DF.namedNode(dt));
    }
    default:
      throw new Error(`Unsupported rdflib termType: ${term.termType}`);
  }
};

/** Convert an RDFJS term to an rdflib.js term. */
const rdfjsTermToRdflib = (term) => {
  const $rdf = window.$rdf;
  if (!$rdf) throw new Error('$rdf not found (is rdflib loaded?)');

  if (!term || !term.termType) throw new Error('Invalid RDFJS term');

  switch (term.termType) {
    case 'NamedNode':
      return $rdf.sym(term.value);
    case 'BlankNode':
      return $rdf.blankNode(term.value);
    case 'Literal': {
      const lang = term.language || '';
      const dt = term.datatype && term.datatype.value ? term.datatype.value : 'http://www.w3.org/2001/XMLSchema#string';
      return lang ? $rdf.literal(term.value, lang) : $rdf.literal(term.value, $rdf.sym(dt));
    }
    default:
      throw new Error(`Unsupported RDFJS termType: ${term.termType}`);
  }
};

/* ------------------------- Parsing ------------------------- */
/** Parse Turtle/N-Triples/TriG/N-Quads with N3.js into a Store (and capture prefixes). */
const parseWithN3 = ({ text, n3Format, baseIRI, logger }) => {
  try {
    const N3 = window.N3;
    if (!N3 || !N3.Parser || !N3.Store) throw new Error('N3 library not available');

    const store = new N3.Store();
    const prefixes = {};

    // N3 parser can report prefixes via prefix callback. citeturn0search4
    const parser = new N3.Parser({ baseIRI, format: n3Format });

    parser.parse(
      text,
      {
        onQuad: (quad) => {
          if (quad) store.addQuad(quad);
        },
        onPrefix: (prefix, iri) => {
          prefixes[prefix] = iri;
        },
      }
    );

    logger.info(`Parsed with N3 (${n3Format}). Quads:`, store.size);
    return { store, prefixes };
  } catch (error) {
    logger.error('N3 parse failed:', error);
    throw error;
  }
};

/** Parse JSON-LD with jsonld.js by converting to N-Quads, then parsing N-Quads with N3.js. */
const parseWithJsonLd = async ({ text, baseIRI, logger }) => {
  try {
    const jsonld = window.jsonld;
    if (!jsonld) throw new Error('jsonld library not available');

    const doc = JSON.parse(text);

    // jsonld.toRDF can emit N-Quads strings. citeturn0search9
    const nquads = await jsonld.toRDF(doc, { format: 'application/n-quads' }).catch(async () => {
      // older docs sometimes use application/nquads
      return jsonld.toRDF(doc, { format: 'application/nquads' });
    });

    const { store } = parseWithN3({ text: nquads, n3Format: 'N-Quads', baseIRI, logger });
    logger.info('Parsed JSON-LD via N-Quads. Quads:', store.size);
    return { store, prefixes: {} };
  } catch (error) {
    logger.error('JSON-LD parse failed:', error);
    throw error;
  }
};

/** Parse RDF/XML (or OWL/XML treated as RDF/XML) with rdflib.js, then convert to an N3 Store. */
const parseWithRdflibXml = async ({ text, baseIRI, logger }) => {
  try {
    const $rdf = window.$rdf;
    const N3 = window.N3;
    if (!$rdf) throw new Error('rdflib ($rdf) not available');
    if (!N3 || !N3.Store || !N3.DataFactory) throw new Error('N3 library not available');

    const graph = $rdf.graph();

    // rdflib.parse is callback-based; wrap in Promise for consistent flow.
    await new Promise((resolve, reject) => {
      try {
        $rdf.parse(text, graph, baseIRI, 'application/rdf+xml', (err) => {
          if (err) reject(err);
          else resolve(true);
        });
      } catch (e) {
        reject(e);
      }
    });

    const store = new N3.Store();
    graph.statements.forEach((st) => {
      const s = rdflibTermToRdfjs(st.subject);
      const p = rdflibTermToRdfjs(st.predicate);
      const o = rdflibTermToRdfjs(st.object);
      store.addQuad(N3.DataFactory.quad(s, p, o));
    });

    logger.info('Parsed RDF/XML via rdflib. Quads:', store.size);
    return { store, prefixes: {} };
  } catch (error) {
    logger.error('RDF/XML parse failed:', error);
    throw error;
  }
};

/** Parse input text into a canonical N3 Store + captured prefixes. */
const parseToStore = async ({ text, inputMime, baseIRI, logger }) => {
  const mime = normalizeMimeType(inputMime);

  if (mime === 'application/ld+json') {
    return parseWithJsonLd({ text, baseIRI, logger });
  }
  if (mime === 'application/rdf+xml') {
    return parseWithRdflibXml({ text, baseIRI, logger });
  }
  if (mimeToN3Format[mime]) {
    return parseWithN3({ text, n3Format: mimeToN3Format[mime], baseIRI, logger });
  }

  throw new Error(`Unsupported input MIME: ${inputMime}`);
};

/* ------------------------- Serialization ------------------------- */
/** Serialize an N3 Store to Turtle/N-Triples/TriG/N-Quads. */
const serializeWithN3 = async ({ store, outputMime, prefixes, logger }) => {
  try {
    const N3 = window.N3;
    if (!N3 || !N3.Writer) throw new Error('N3.Writer not available');

    const format = mimeToN3Format[outputMime];
    if (!format) throw new Error(`Unsupported N3 output MIME: ${outputMime}`);

    const writer = new N3.Writer({ format });

    if ((outputMime === 'text/turtle' || outputMime === 'application/trig') && prefixes && Object.keys(prefixes).length) {
      writer.addPrefixes(prefixes);
    }

    const quads = store.getQuads(null, null, null, null);
    writer.addQuads(quads);

    const out = await new Promise((resolve, reject) => {
      writer.end((err, result) => (err ? reject(err) : resolve(result)));
    });

    logger.info(`Serialized with N3 (${format}). Bytes:`, out.length);
    return out;
  } catch (error) {
    logger.error('N3 serialization failed:', error);
    throw error;
  }
};

/** Serialize an N3 Store to JSON-LD via N-Quads using jsonld.js. */
const serializeToJsonLd = async ({ store, logger }) => {
  try {
    const jsonld = window.jsonld;
    const N3 = window.N3;
    if (!jsonld) throw new Error('jsonld library not available');
    if (!N3 || !N3.Writer) throw new Error('N3.Writer not available');

    // First write N-Quads
    const nquads = await serializeWithN3({ store, outputMime: 'application/n-quads', prefixes: {}, logger });

    // Then jsonld.fromRDF
    const doc = await jsonld.fromRDF(nquads, { format: 'application/n-quads' }).catch(async () => {
      return jsonld.fromRDF(nquads, { format: 'application/nquads' });
    });

    const out = JSON.stringify(doc, null, 2);
    logger.info('Serialized to JSON-LD. Bytes:', out.length);
    return out;
  } catch (error) {
    logger.error('JSON-LD serialization failed:', error);
    throw error;
  }
};

/** Serialize an N3 Store to RDF/XML using rdflib.js (convert quads into rdflib graph first). */
const serializeToRdfXml = async ({ store, baseIRI, logger }) => {
  try {
    const $rdf = window.$rdf;
    if (!$rdf) throw new Error('rdflib ($rdf) not available');

    const graph = $rdf.graph();
    store.getQuads(null, null, null, null).forEach((q) => {
      const s = rdfjsTermToRdflib(q.subject);
      const p = rdfjsTermToRdflib(q.predicate);
      const o = rdfjsTermToRdflib(q.object);
      graph.add(s, p, o);
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

    logger.info('Serialized to RDF/XML. Bytes:', xml.length);
    return xml;
  } catch (error) {
    logger.error('RDF/XML serialization failed:', error);
    throw error;
  }
};

/** Serialize store to the requested output MIME. */
const serializeFromStore = async ({ store, outputMime, prefixes, baseIRI, logger }) => {
  const mime = normalizeMimeType(outputMime);

  if (mime === 'application/ld+json') {
    return serializeToJsonLd({ store, logger });
  }
  if (mime === 'application/rdf+xml') {
    return serializeToRdfXml({ store, baseIRI, logger });
  }
  if (mimeToN3Format[mime]) {
    return serializeWithN3({ store, outputMime: mime, prefixes, logger });
  }

  throw new Error(`Unsupported output MIME: ${outputMime}`);
};

/* ------------------------- Mermaid / D3 (optional) ------------------------- */
/** Convert an N3 Store to a simple D3 node-link JSON structure. */
const storeToD3 = ({ store }) => {
  const nodesById = new Map();
  const links = [];

  const termId = (t) => `${t.termType}:${t.value}`;

  store.getQuads(null, null, null, null).forEach((q) => {
    const sId = termId(q.subject);
    const oId = termId(q.object);
    if (!nodesById.has(sId)) nodesById.set(sId, { id: sId, value: q.subject.value, termType: q.subject.termType });
    if (!nodesById.has(oId)) nodesById.set(oId, { id: oId, value: q.object.value, termType: q.object.termType });
    links.push({ source: sId, target: oId, predicate: q.predicate.value });
  });

  return { nodes: Array.from(nodesById.values()), links };
};

/** Convert an N3 Store to a basic Mermaid flowchart (very simple). */
const storeToMermaid = ({ store }) => {
  const esc = (s) => s.replace(/"/g, '\\"');
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
};

/* ------------------------- UI utilities ------------------------- */
/** Read a File object as text (impure). */
const readFileAsText = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('File read error'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsText(file);
  });

/** Get selected radio value for a group (impure). */
const getSelectedRadioValue = (groupName) => {
  const selected = document.querySelector(`input[name="${groupName}"]:checked`);
  return selected ? selected.value : null;
};

/** Set selected radio value for a group (impure). */
const setSelectedRadioValue = (groupName, value) => {
  const radio = document.querySelector(`input[name="${groupName}"][value="${value}"]`);
  if (radio) radio.checked = true;
};

/** Auto-guess input mime type from filename, then select matching radio. */
const guessInputFromFilename = ({ filename }) => {
  const lower = (filename || '').toLowerCase();
  const match = Object.entries(extensionToMime).find(([ext]) => lower.endsWith(ext));
  return match ? match[1] : null;
};

/** Update enabled/disabled output options based on input MIME. */
const updateOutputOptions = ({ inputMime, logger }) => {
  const supported = supportedConversions[normalizeMimeType(inputMime)] || [];
  const outputs = document.querySelectorAll('input[name="output"]');
  outputs.forEach((o) => {
    const isAllowed = supported.includes(normalizeMimeType(o.value));
    o.disabled = !isAllowed;
    o.parentElement.style.opacity = isAllowed ? '1' : '0.45';
  });

  // If the currently selected output is now disabled, pick first allowed.
  const current = getSelectedRadioValue('output');
  if (!current || !supported.includes(normalizeMimeType(current))) {
    if (supported.length) setSelectedRadioValue('output', supported[0]);
  }

  logger.info('Updated output options for input:', inputMime, 'Allowed:', supported);
};

/** Create a downloadable file (impure). */
const downloadContent = ({ content, filename, mimeType }) => {
  const blob = new Blob([content], { type: mimeType || 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

/* ------------------------- Capability matrix ------------------------- */
/**
 * Supported conversions given the hybrid stack.
 * - RDF/XML (and OWL/XML) can be parsed by rdflib then serialized to N3 formats, JSON-LD, RDF/XML.
 * - Turtle/N-Triples/TriG parsed by N3 then serialized widely.
 * - JSON-LD parsed by jsonld then serialized widely.
 */
const supportedConversions = Object.freeze({
  'application/n-triples': [
    'application/n-triples',
    'text/turtle',
    'application/trig',
    'application/ld+json',
    'application/rdf+xml',
    'text/mermaid',
    'application/d3+json',
  ],
  'text/turtle': [
    'application/n-triples',
    'text/turtle',
    'application/trig',
    'application/ld+json',
    'application/rdf+xml',
    'text/mermaid',
    'application/d3+json',
  ],
  'application/trig': [
    'application/n-triples',
    'text/turtle',
    'application/trig',
    'application/ld+json',
    'application/rdf+xml',
    'text/mermaid',
    'application/d3+json',
  ],
  'application/ld+json': [
    'application/n-triples',
    'text/turtle',
    'application/trig',
    'application/ld+json',
    'application/rdf+xml',
    'text/mermaid',
    'application/d3+json',
  ],
  'application/rdf+xml': [
    'application/n-triples',
    'text/turtle',
    'application/trig',
    'application/ld+json',
    'application/rdf+xml',
    'text/mermaid',
    'application/d3+json',
  ],
});
/* ------------------------- Main orchestrator ------------------------- */
/** Orchestrate: read → parse → serialize → show output. */
const transformRDF = async ({ file, inputMime, outputMime, baseIRI, logger }) => {
  try {
    if (!file) throw new Error('No file selected');
    if (!inputMime) throw new Error('No input format selected');
    if (!outputMime) throw new Error('No output format selected');

    logger.info('Reading file:', file.name);
    const text = await readFileAsText(file);

    logger.info('Parsing as:', inputMime);
    const { store, prefixes } = await parseToStore({ text, inputMime, baseIRI, logger });

    // Mermaid/D3 as special outputs (optional)
    if (outputMime === 'text/mermaid') {
      return storeToMermaid({ store });
    }
    if (outputMime === 'application/d3+json') {
      return JSON.stringify(storeToD3({ store }), null, 2);
    }

    logger.info('Serializing to:', outputMime);
    const out = await serializeFromStore({ store, outputMime, prefixes, baseIRI, logger });
    return out;
  } catch (error) {
    logger.error('Transformation failed:', error);
    throw error;
  }
};

/* ------------------------- Setup ------------------------- */
/** Bind UI events and initialize defaults (impure). */
const setupEventHandlers = () => {
  const logger = makeLogger('ldt');
  const fileInput = document.getElementById('fileInput');
  const transformBtn = document.getElementById('transformBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const outputArea = document.getElementById('outputArea');

  if (!fileInput || !transformBtn || !downloadBtn || !outputArea) {
    logger.error('Missing expected DOM elements. Check IDs: fileInput/transformBtn/downloadBtn/outputArea');
    return;
  }

  // Library presence checks
  logger.info('Libraries present:', {
    N3: !!window.N3,
    jsonld: !!window.jsonld,
    rdflib: !!window.$rdf,
  });

  let lastOutput = '';
  let lastOutputMime = 'text/plain';

  // Input radio change -> update outputs
  document.querySelectorAll('input[name="input"]').forEach((radio) => {
    radio.addEventListener('change', () => updateOutputOptions({ inputMime: radio.value, logger }));
  });

  // File selection -> auto-guess input format + update outputs
  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    const guessed = guessInputFromFilename({ filename: file.name });
    if (guessed) {
      setSelectedRadioValue('input', guessed);
      updateOutputOptions({ inputMime: guessed, logger });
      logger.info('Auto-selected input format:', guessed);
    } else {
      logger.warn('Could not guess input format from extension:', file.name);
    }
  });

  // Transform
  transformBtn.addEventListener('click', async () => {
    try {
      const file = fileInput.files && fileInput.files[0];
      const inputMime = getSelectedRadioValue('input');
      const outputMime = getSelectedRadioValue('output');
      const baseIRI = 'http://example.org/';

      const out = await transformRDF({ file, inputMime, outputMime, baseIRI, logger });
      outputArea.value = out;
      lastOutput = out;
      lastOutputMime = outputMime;
      logger.info('Transformation successful.');
    } catch (e) {
      outputArea.value = '';
      logger.error('Transform error:', e);
      alert(`Transformation failed: ${e && e.message ? e.message : String(e)}`);
    }
  });

  // Download
  downloadBtn.addEventListener('click', () => {
    try {
      if (!lastOutput) {
        alert('Nothing to download yet. Run a transformation first.');
        return;
      }
      const ext = ({
        'application/n-triples': 'nt',
        'text/turtle': 'ttl',
        'application/trig': 'trig',
        'application/ld+json': 'jsonld',
        'application/rdf+xml': 'rdf',
        'text/mermaid': 'mmd',
        'application/d3+json': 'json',
      })[normalizeMimeType(lastOutputMime)] || 'txt';

      downloadContent({ content: lastOutput, filename: `transformed.${ext}`, mimeType: lastOutputMime });
    } catch (e) {
      console.error('Download error:', e);
      alert(`Download failed: ${e && e.message ? e.message : String(e)}`);
    }
  });

  // Initialize output options based on whatever is currently checked (or default)
  const initialInput = getSelectedRadioValue('input') || 'text/turtle';
  setSelectedRadioValue('input', initialInput);
  updateOutputOptions({ inputMime: initialInput, logger });
};

document.addEventListener('DOMContentLoaded', setupEventHandlers);
