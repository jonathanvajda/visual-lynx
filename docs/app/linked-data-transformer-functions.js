/* linked-data-transformer-functions.v2.js
   Hybrid transform pipeline:
   - N3.js: Turtle / N-Triples / TriG parsing + serialization
   - jsonld.js: JSON-LD parsing + serialization (bridge via N-Quads)
   - rdflib.js: RDF/XML + OWL/XML parsing + serialization (and RDF/XML output for non-XML inputs)
*/

/* ----------------------------- Logging ----------------------------- */

/** Create a simple logger interface so pure-ish core functions can be tested with a no-op logger. */
const makeLogger = (overrides = {}) => {
  const noop = () => {};
  return {
    info: overrides.info || console.info.bind(console),
    warn: overrides.warn || console.warn.bind(console),
    error: overrides.error || console.error.bind(console),
    debug: overrides.debug || (console.debug ? console.debug.bind(console) : noop)
  };
};

/* ----------------------------- Constants ----------------------------- */

const DEFAULT_BASE_IRI = 'http://example.org/';

const MIME = {
  NTRIPLES: 'application/n-triples',
  TURTLE: 'text/turtle',
  TRIG: 'application/trig',
  JSONLD: 'application/ld+json',
  RDFXML: 'application/rdf+xml',
  OWLXML: 'application/owl+xml',
  MERMAID: 'text/x-mermaid',
  D3JSON: 'application/json-d3'
};

const N3_FORMAT = {
  [MIME.NTRIPLES]: 'N-Triples',
  [MIME.TURTLE]: 'Turtle',
  [MIME.TRIG]: 'TriG'
};

const EXT_BY_MIME = {
  [MIME.NTRIPLES]: 'nt',
  [MIME.TURTLE]: 'ttl',
  [MIME.TRIG]: 'trig',
  [MIME.JSONLD]: 'jsonld',
  [MIME.RDFXML]: 'rdf',
  [MIME.OWLXML]: 'owl',
  [MIME.MERMAID]: 'mmd',
  [MIME.D3JSON]: 'json'
};

/* ----------------------------- Utilities ----------------------------- */

/** Normalize OWL/XML to RDF/XML for rdflib.js parsing/serialization. */
const normalizeXmlMime = (mimeType) => (mimeType === MIME.OWLXML ? MIME.RDFXML : mimeType);

/** Extract the selected value for a radio group (throws if none selected). */
const getSelectedRadioValue = (groupName) => {
  const selected = document.querySelector(`input[name="${groupName}"]:checked`);
  if (!selected) throw new Error(`No ${groupName} selected`);
  return selected.value;
};

/** Read a File as text. */
const readFileAsText = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(reader.error || new Error('File read error'));
  reader.readAsText(file);
});

/** Create and trigger a download of the given string content. */
const downloadContent = (filename, content, mimeType = 'text/plain') => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

/** Build a safe output filename from input filename + output mime. */
const buildOutputFilename = (inputFileName, outputMime) => {
  const base = (inputFileName || 'output').replace(/\.[^.]+$/, '');
  const ext = EXT_BY_MIME[outputMime] || 'txt';
  return `${base}.${ext}`;
};

/* ----------------------------- Core graph model ----------------------------- */

/** 
 * Parse Turtle / N-Triples / TriG with N3.js into { store, prefixes }.
 * Prefixes are preserved for Turtle/TriG where present.
 */
const parseWithN3 = (text, mimeType, logger = makeLogger()) => {
  try {
    const format = N3_FORMAT[mimeType];
    if (!format) throw new Error(`N3 parser does not support mime: ${mimeType}`);

    logger.info(`N3 parsing as ${format}`);
    const parser = new N3.Parser({ format });
    const store = new N3.Store();
    let prefixes = {};

    parser.parse(text, (error, quad, pfx) => {
      if (error) throw error;
      if (quad) store.addQuad(quad);
      if (!quad && pfx) prefixes = pfx;
    });

    return { kind: 'n3', store, prefixes };
  } catch (err) {
    logger.error('N3 parse failed', err);
    throw new Error('RDF parsing error (N3)');
  }
};

/**
 * Parse JSON-LD with jsonld.js by converting to N-Quads then parsing with N3.
 * This avoids rdflib.js JSON-LD chunk-loading issues.
 */
const parseJsonLdToN3 = async (text, logger = makeLogger()) => {
  try {
    logger.info('Parsing JSON-LD via jsonld.toRDF → N-Quads');
    const obj = JSON.parse(text);

    // NOTE: JSON-LD may try to fetch remote @context unless you supply a custom documentLoader.
    // For fully offline use, provide a no-network documentLoader and ship contexts locally.
    const nquads = await jsonld.toRDF(obj, { format: 'application/n-quads' });
    const parser = new N3.Parser({ format: 'N-Quads' });
    const store = new N3.Store();

    parser.parse(nquads, (error, quad) => {
      if (error) throw error;
      if (quad) store.addQuad(quad);
    });

    return { kind: 'n3', store, prefixes: {} };
  } catch (err) {
    logger.error('JSON-LD parse failed', err);
    throw new Error('RDF parsing error (JSON-LD)');
  }
};

/**
 * Parse RDF/XML (or OWL/XML normalized to RDF/XML) with rdflib.js.
 */
const parseWithRdflibXml = (text, mimeType, baseIRI = DEFAULT_BASE_IRI, logger = makeLogger()) => {
  try {
    const norm = normalizeXmlMime(mimeType);
    if (norm !== MIME.RDFXML) throw new Error(`rdflib XML parser only supports RDF/XML, got: ${mimeType}`);

    logger.info('rdflib parsing as RDF/XML');
    const store = $rdf.graph();
    $rdf.parse(text, store, baseIRI, MIME.RDFXML);
    return { kind: 'rdflib', store };
  } catch (err) {
    logger.error('rdflib RDF/XML parse failed', err);
    throw new Error('RDF parsing error (RDF/XML)');
  }
};

/**
 * Convert an N3.Store into an rdflib graph. Named graphs are flattened (RDF/XML has no named graphs).
 */
const n3StoreToRdflibGraph = (n3Store, baseIRI = DEFAULT_BASE_IRI, logger = makeLogger()) => {
  try {
    const g = $rdf.graph();
    const quads = n3Store.getQuads(null, null, null, null);

    quads.forEach((q) => {
      const s = termToRdflib(q.subject);
      const p = termToRdflib(q.predicate);
      const o = termToRdflib(q.object);

      // Flatten graph if present
      if (q.graph && q.graph.termType && q.graph.termType !== 'DefaultGraph') {
        logger.warn('Flattening named graph statement for RDF/XML output:', q.graph.value);
      }

      g.add(s, p, o);
    });

    return g;
  } catch (err) {
    logger.error('Failed converting N3 store to rdflib graph', err);
    throw new Error('Internal conversion error (N3→rdflib)');
  }
};

/** Convert an RDFJS term (from N3) to an rdflib term. */
const termToRdflib = (term) => {
  switch (term.termType) {
    case 'NamedNode':
      return $rdf.sym(term.value);
    case 'BlankNode':
      // Keep the same identifier when possible
      return $rdf.blankNode(term.value);
    case 'Literal': {
      const lang = term.language || '';
      const dt = term.datatype && term.datatype.value ? $rdf.sym(term.datatype.value) : undefined;
      // rdflib.literal(value, lang, datatype)
      return $rdf.literal(term.value, lang, dt);
    }
    default:
      // DefaultGraph or unknown
      return $rdf.sym(term.value || DEFAULT_BASE_IRI);
  }
};

/* ----------------------------- Serialization ----------------------------- */

/** Serialize an N3.Store to Turtle / N-Triples / TriG. */
const serializeWithN3 = (n3Store, outMime, prefixes = {}, logger = makeLogger()) => {
  try {
    const format = N3_FORMAT[outMime];
    if (!format) throw new Error(`N3 writer does not support mime: ${outMime}`);

    logger.info(`N3 serializing as ${format}`);

    const writer = new N3.Writer({ format, prefixes });
    const quads = n3Store.getQuads(null, null, null, null);
    writer.addQuads(quads);

    return new Promise((resolve, reject) => {
      writer.end((err, result) => (err ? reject(err) : resolve(result)));
    });
  } catch (err) {
    logger.error('N3 serialization failed', err);
    throw new Error('RDF serialization error (N3)');
  }
};

/** Serialize an N3.Store to N-Quads string (for JSON-LD bridge). */
const serializeStoreToNQuads = (n3Store) => new Promise((resolve, reject) => {
  const writer = new N3.Writer({ format: 'N-Quads' });
  writer.addQuads(n3Store.getQuads(null, null, null, null));
  writer.end((err, result) => (err ? reject(err) : resolve(result)));
});

/** Serialize to JSON-LD using jsonld.fromRDF via N-Quads bridge. */
const serializeToJsonLd = async (n3Store, logger = makeLogger()) => {
  try {
    logger.info('Serializing to JSON-LD via N-Quads → jsonld.fromRDF');
    const nquads = await serializeStoreToNQuads(n3Store);
    const jsonObj = await jsonld.fromRDF(nquads, { format: 'application/n-quads' });
    return JSON.stringify(jsonObj, null, 2);
  } catch (err) {
    logger.error('JSON-LD serialization failed', err);
    throw new Error('RDF serialization error (JSON-LD)');
  }
};

/** Serialize to RDF/XML using rdflib.js. Accepts either rdflib store or N3 store (converted). */
const serializeToRdfXml = (graphOrStore, baseIRI = DEFAULT_BASE_IRI, logger = makeLogger()) => {
  try {
    logger.info('Serializing to RDF/XML via rdflib.serialize');
    // rdflib serialize is callback-based; wrap in Promise
    return new Promise((resolve, reject) => {
      $rdf.serialize(
        null,
        graphOrStore,
        baseIRI,
        MIME.RDFXML,
        (err, result) => (err ? reject(err) : resolve(String(result || '')))
      );
    });
  } catch (err) {
    logger.error('RDF/XML serialization failed', err);
    throw new Error('RDF serialization error (RDF/XML)');
  }
};

/* ----------------------------- Non-RDF Outputs ----------------------------- */

/** Convert an N3.Store to Mermaid flowchart syntax. */
const rdfToMermaidFromN3 = (n3Store) => {
  const esc = (s) => String(s).replace(/"/g, '\"');
  let out = 'graph TD\n';
  const quads = n3Store.getQuads(null, null, null, null);

  quads.forEach((q) => {
    const s = esc(q.subject.value);
    const p = esc(q.predicate.value);
    const o = esc(q.object.value);
    out += `  "${s}" -- "${p}" --> "${o}"\n`;
  });

  return out;
};

/** Convert an N3.Store to a D3 node-link JSON object string. */
const rdfToD3JsonFromN3 = (n3Store) => {
  const nodesSet = new Set();
  const links = [];
  const quads = n3Store.getQuads(null, null, null, null);

  quads.forEach((q) => {
    nodesSet.add(q.subject.value);
    nodesSet.add(q.object.value);
    links.push({ source: q.subject.value, target: q.object.value, predicate: q.predicate.value });
  });

  const nodes = Array.from(nodesSet).map((id) => ({ id }));
  return JSON.stringify({ nodes, links }, null, 2);
};

/* ----------------------------- Orchestration ----------------------------- */

/**
 * Transform text from inputMime to outputMime.
 * Returns { outputText, outMimeForDownload }.
 */
const transformText = async (text, inputMime, outputMime, baseIRI = DEFAULT_BASE_IRI, logger = makeLogger()) => {
  // Parse into internal representation:
  // - N3 store for Turtle/N-Triples/TriG/JSON-LD
  // - rdflib graph for RDF/XML input (also convertible to N3 if you later add that)
  if (!text.trim()) throw new Error('Input file is empty');

  // Parse
  let parsed = null;

  if (inputMime === MIME.JSONLD) {
    parsed = await parseJsonLdToN3(text, logger);
  } else if (inputMime === MIME.RDFXML || inputMime === MIME.OWLXML) {
    parsed = parseWithRdflibXml(text, inputMime, baseIRI, logger);
  } else {
    parsed = parseWithN3(text, inputMime, logger);
  }

  // Output routing
  if (outputMime === MIME.MERMAID) {
    if (parsed.kind !== 'n3') throw new Error('Mermaid output currently supported only for Turtle/N-Triples/TriG/JSON-LD inputs');
    return { outputText: rdfToMermaidFromN3(parsed.store), outMimeForDownload: 'text/plain' };
  }

  if (outputMime === MIME.D3JSON) {
    if (parsed.kind !== 'n3') throw new Error('D3 JSON output currently supported only for Turtle/N-Triples/TriG/JSON-LD inputs');
    return { outputText: rdfToD3JsonFromN3(parsed.store), outMimeForDownload: 'application/json' };
  }

  if (outputMime === MIME.JSONLD) {
    if (parsed.kind !== 'n3') throw new Error('JSON-LD output currently supported only for Turtle/N-Triples/TriG/JSON-LD inputs');
    return { outputText: await serializeToJsonLd(parsed.store, logger), outMimeForDownload: 'application/ld+json' };
  }

  if (outputMime === MIME.RDFXML || outputMime === MIME.OWLXML) {
    // Emit RDF/XML via rdflib. If we parsed with N3, convert N3 store → rdflib graph first.
    const graph = parsed.kind === 'rdflib' ? parsed.store : n3StoreToRdflibGraph(parsed.store, baseIRI, logger);
    const xml = await serializeToRdfXml(graph, baseIRI, logger);
    return { outputText: xml, outMimeForDownload: 'application/rdf+xml' };
  }

  // N3 writer outputs
  if (outputMime === MIME.NTRIPLES || outputMime === MIME.TURTLE || outputMime === MIME.TRIG) {
    if (parsed.kind !== 'n3') throw new Error('Turtle/N-Triples/TriG output currently supported only for Turtle/N-Triples/TriG/JSON-LD inputs');
    const out = await serializeWithN3(parsed.store, outputMime, parsed.prefixes || {}, logger);
    return { outputText: out, outMimeForDownload: outputMime };
  }

  throw new Error(`Unsupported output format: ${outputMime}`);
};

/* ----------------------------- UI wiring ----------------------------- */

const setStatus = (el, kind, msg) => {
  el.classList.remove('ldt-status--ok', 'ldt-status--warn', 'ldt-status--err');
  if (kind === 'ok') el.classList.add('ldt-status--ok');
  if (kind === 'warn') el.classList.add('ldt-status--warn');
  if (kind === 'err') el.classList.add('ldt-status--err');
  el.textContent = msg || '';
};

const setupEventHandlers = () => {
  const logger = makeLogger();
  const fileInput = document.getElementById('fileInput');
  const transformBtn = document.getElementById('transformBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const outputArea = document.getElementById('outputArea');
  const statusEl = document.getElementById('status');

  let lastOutput = '';
  let lastOutputMime = 'text/plain';
  let lastInputName = 'output';

  transformBtn.onclick = async () => {
    try {
      setStatus(statusEl, 'warn', 'Working…');
      const file = fileInput.files && fileInput.files[0];
      if (!file) throw new Error('Please choose a file first.');

      const inputMime = getSelectedRadioValue('input');
      const outputMime = getSelectedRadioValue('output');

      lastInputName = file.name || 'output';
      logger.info('Reading file:', lastInputName);

      const text = await readFileAsText(file);
      const { outputText, outMimeForDownload } = await transformText(text, inputMime, outputMime, DEFAULT_BASE_IRI, logger);

      lastOutput = outputText;
      lastOutputMime = outMimeForDownload;

      outputArea.value = outputText;
      setStatus(statusEl, 'ok', 'Transformation successful.');
    } catch (err) {
      logger.error('Transform failed:', err);
      outputArea.value = '';
      lastOutput = '';
      setStatus(statusEl, 'err', (err && err.message) ? err.message : 'Transformation failed.');
    }
  };

  downloadBtn.onclick = () => {
    try {
      if (!lastOutput) throw new Error('Nothing to download yet. Run Transform first.');
      const outputMime = getSelectedRadioValue('output');
      const filename = buildOutputFilename(lastInputName, outputMime);
      downloadContent(filename, lastOutput, lastOutputMime);
      setStatus(statusEl, 'ok', `Downloaded ${filename}`);
    } catch (err) {
      logger.error('Download failed:', err);
      setStatus(statusEl, 'err', (err && err.message) ? err.message : 'Download failed.');
    }
  };
};

window.addEventListener('load', setupEventHandlers);
