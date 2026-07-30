
import { normalizePrefixMap } from './shared/namespace-registry/prefix-map.js';
import { COMMON_NAMESPACE_IRIS } from './shared/namespace-registry/namespace-registry.js';
import { extractXmlNamespacePrefixes } from './shared/namespace-registry/rdf-prefixes.js';
import {
  downloadTextFile,
  readFileAsText
} from './shared/browser-file-io/index.js';
import {
  getPreferredExtensionForMimeType,
  getSupportedMimeTypeForFilename,
  normalizeSupportedMimeType
} from './shared/format-registry/mime-registry.js';
import {
  parseRdfTextWithAdapters,
  serializeRdfDatasetWithAdapters
} from './shared/rdf-io/index.js';

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
const NS = COMMON_NAMESPACE_IRIS;

/** Create a structured logger (info/warn/error). */
const makeLogger = (scope = 'ldt') => ({
  info: (...args) => console.info(`[${scope}]`, ...args),
  warn: (...args) => console.warn(`[${scope}]`, ...args),
  error: (...args) => console.error(`[${scope}]`, ...args),
});

/* ------------------------- Format registry ------------------------- */
const registryMimeType = (mimeType) => {
  const normalized = normalizeSupportedMimeType(mimeType);
  return normalized.ok ? normalized.value.mimeType : String(mimeType || '').trim();
};

const extractRdfXmlPrefixes = (text) => normalizePrefixMap(extractXmlNamespacePrefixes(text)).prefixes;

/* ------------------------- Parsing ------------------------- */
/** Parse input text into a canonical N3 Store + captured prefixes. */
const parseToStore = async ({ text, inputMime, baseIRI, logger }) => {
  const mime = registryMimeType(inputMime);
  const parsed = await parseRdfTextWithAdapters(text, {
    format: mime,
    baseIri: baseIRI,
    runtime: { N3: window.N3, jsonld: window.jsonld, $rdf: window.$rdf }
  });
  const rdfXmlPrefixes = mime === 'application/rdf+xml' ? extractRdfXmlPrefixes(text) : {};
  logger.info(`Parsed with shared RDF adapter (${mime}). Quads:`, parsed.quads.length);
  return {
    store: parsed.dataset,
    prefixes: { ...rdfXmlPrefixes, ...(parsed.prefixes || {}) }
  };
};
/* ------------------------- Serialization ------------------------- */
/** Serialize store to the requested output MIME. */
const serializeFromStore = async ({ store, outputMime, prefixes, baseIRI, logger }) => {
  const mime = registryMimeType(outputMime);

  if (mime === 'application/ld+json' || mime === 'application/rdf+xml' || mime === 'text/turtle' || mime === 'application/n-triples' || mime === 'application/n-quads' || mime === 'application/trig' || mime === 'text/n3') {
    const serialized = await serializeRdfDatasetWithAdapters(store, {
      format: mime,
      prefixes,
      baseIri: baseIRI,
      runtime: { N3: window.N3, jsonld: window.jsonld, $rdf: window.$rdf }
    });
    logger.info(`Serialized with shared RDF adapter (${mime}). Bytes:`, serialized.text.length);
    return serialized.text;
  }
if (mime === 'text/mermaid') {
  const out = storeToMermaid({ store });
  logger.info('Serialized to Mermaid. Bytes:', out.length);
  return out;
}
if (mime === 'application/d3+json') {
  const obj = storeToD3({ store });
  const out = JSON.stringify(obj, null, 2);
  logger.info('Serialized to D3 JSON. Bytes:', out.length);
  return out;
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

/** Pick the focused RDF serialization sugar module for an output format. */
const getSugarSerial = (mimeType) => {
  const mime = registryMimeType(mimeType);
  return [
    window.N3SugarSerial,
    window.RdflibSugarSerial,
  ].find((module) => module && module.supports && module.supports(mime)) || null;
};

function describeError(error) {
  return error && typeof error === 'object' && 'message' in error
    ? error.message
    : String(error);
}

/** Update the optional Sugar Serial checkbox based on output format. */
const updatePrettifierOption = ({ outputMime }) => {
  const checkbox = document.getElementById('prettifyRdfOutput');
  if (!checkbox) return;

  const isSupported = !!getSugarSerial(outputMime);
  checkbox.disabled = !isSupported;
  checkbox.parentElement.style.opacity = isSupported ? '1' : '0.45';
};

/** Auto-guess input mime type from filename, then select matching radio. */
const guessInputFromFilename = ({ filename }) => {
  const detected = getSupportedMimeTypeForFilename(filename);
  return detected.ok && detected.value.category === 'rdf' ? detected.value.mimeType : null;
};

/** Update enabled/disabled output options based on input MIME. */
const updateOutputOptions = ({ inputMime, logger }) => {
  const supported = supportedConversions[registryMimeType(inputMime)] || [];
  const outputs = document.querySelectorAll('input[name="output"]');
  outputs.forEach((o) => {
    const isAllowed = supported.includes(registryMimeType(o.value));
    o.disabled = !isAllowed;
    o.parentElement.style.opacity = isAllowed ? '1' : '0.45';
  });

  // If the currently selected output is now disabled, pick first allowed.
  const current = getSelectedRadioValue('output');
  if (!current || !supported.includes(registryMimeType(current))) {
    if (supported.length) setSelectedRadioValue('output', supported[0]);
  }

  updatePrettifierOption({ outputMime: getSelectedRadioValue('output') });
  logger.info('Updated output options for input:', inputMime, 'Allowed:', supported);
};

/** Create a downloadable file (impure). */
const downloadContent = ({ content, filename, mimeType }) => {
  downloadTextFile(filename, content, { mimeType: mimeType || 'text/plain' });
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
    // Browser file I/O stops here; parse/convert/serialize contracts should be promoted separately.
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
    logger.error('Transformation failed:', describeError(error));
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
  const prettifyCheckbox = document.getElementById('prettifyRdfOutput');

  if (!fileInput || !transformBtn || !downloadBtn || !outputArea) {
    logger.error('Missing expected DOM elements. Check IDs: fileInput/transformBtn/downloadBtn/outputArea');
    return;
  }

  // Library presence checks
  logger.info('Libraries present:', {
    N3: !!window.N3,
    jsonld: !!window.jsonld,
    rdflib: !!window.$rdf,
    n3SugarSerial: !!window.N3SugarSerial,
    rdflibSugarSerial: !!window.RdflibSugarSerial,
  });

  let lastOutput = '';
  let lastOutputMime = 'text/plain';

  // Input radio change -> update outputs
  document.querySelectorAll('input[name="input"]').forEach((radio) => {
    radio.addEventListener('change', () => updateOutputOptions({ inputMime: radio.value, logger }));
  });

  document.querySelectorAll('input[name="output"]').forEach((radio) => {
    radio.addEventListener('change', () => updatePrettifierOption({ outputMime: radio.value }));
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

      let out = await transformRDF({ file, inputMime, outputMime, baseIRI, logger });
      const sugarSerial = getSugarSerial(outputMime);
      const shouldPrettify = !!(prettifyCheckbox && prettifyCheckbox.checked && !prettifyCheckbox.disabled);
      if (shouldPrettify && sugarSerial) {
        const sourceText = await readFileAsText(file);
        const result = sugarSerial.prettify({
          text: out,
          mimeType: outputMime,
          sourceText,
          sourceMimeType: inputMime,
          baseIRI,
          logger,
        });
        out = result.text;
        if (!result.applied && result.warnings && result.warnings.length) {
          logger.warn('RDF serialization sugar returned original output:', result.warnings.join('; '));
        }
      }
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
      const preferred = getPreferredExtensionForMimeType(lastOutputMime);
      const ext = preferred.ok ? preferred.value : 'txt';
      downloadTextFile(`transformed.${ext}`, lastOutput, { mimeType: lastOutputMime });
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
