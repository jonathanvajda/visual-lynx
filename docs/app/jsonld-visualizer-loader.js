// docs/app/jsonld-visualizer-loader.js

import { createTransformer } from './linked-data-transformer-core.js';
import { readFileAsText } from './shared/browser-file-io/index.js';
import {
  getSupportedMimeTypeForFilename,
  normalizeSupportedMimeType,
} from './shared/format-registry/index.js';

const makeLogger = (scope = 'jsonld-loader') => ({
  info: (...args) => console.info(`[${scope}]`, ...args),
  warn: (...args) => console.warn(`[${scope}]`, ...args),
  error: (...args) => console.error(`[${scope}]`, ...args),
});

/**
 * Load the stock BFO JSON-LD example into the textarea.
 * @param {HTMLTextAreaElement} jsonInput
 * @param {ReturnType<typeof makeLogger>} logger
 * @returns {Promise<void>}
 */
async function loadStockJsonLd(jsonInput, logger) {
  try {
    const response = await fetch('./data/bfo-json-ld.json');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const content = await response.text();
    jsonInput.value = content;
    logger.info('Loaded stock BFO JSON-LD.');
  } catch (error) {
    logger.error('Error fetching BFO JSON-LD:', error);
    jsonInput.value = `Error loading file from server: ${error && error.message ? error.message : String(error)}`;
  }
}

function setupJsonLdVisualizerLoader() {
  const logger = makeLogger();

  const fileInput = document.getElementById('graphFileInput');
  const formatSelect = document.getElementById('graphInputFormat');
  const loadBfoBtn = document.getElementById('loadBfoGraphDataBtn');
  const renderBtn = document.getElementById('renderBtn');
  const jsonInput = document.getElementById('jsonInput');

  if (!fileInput || !formatSelect || !loadBfoBtn || !renderBtn || !jsonInput) {
    logger.error('Missing expected DOM elements: graphFileInput, graphInputFormat, loadBfoGraphDataBtn, renderBtn, jsonInput');
    return;
  }

  const transformer = createTransformer({
    N3: window.N3,
    jsonld: window.jsonld,
    $rdf: window.$rdf,
  });

  logger.info('Libraries present:', {
    N3: !!window.N3,
    jsonld: !!window.jsonld,
    rdflib: !!window.$rdf,
    renderGraphFromTextarea: typeof window.renderGraphFromTextarea === 'function',
  });

  // File input -> read, detect/override type, convert to JSON-LD, write into textarea
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    try {
      const selectedFormat = formatSelect.value && formatSelect.value !== 'auto'
        ? normalizeSupportedMimeType(formatSelect.value)
        : getSupportedMimeTypeForFilename(file.name);
      const inputMime = selectedFormat.ok && selectedFormat.value.category === 'rdf'
        ? selectedFormat.value.mimeType
        : null;
      if (!inputMime) {
        throw new Error(`Could not determine input format for file: ${file.name}`);
      }

      logger.info('Selected file:', file.name, 'Input MIME:', inputMime);

      const text = await readFileAsText(file);

      const out = await transformer.transformText({
        text,
        inputMime,
        outputMime: 'application/ld+json',
        baseIRI: 'http://example.org/',
        logger,
      });

      jsonInput.value = out;
      logger.info('Loaded transformed JSON-LD into textarea.');
    } catch (error) {
      logger.error('Failed to load/transform graph file:', error);
      jsonInput.value = `Error loading file: ${error && error.message ? error.message : String(error)}`;
    }
  });

  // Stock example button
  loadBfoBtn.addEventListener('click', async () => {
    await loadStockJsonLd(jsonInput, logger);
  });

  // Render button
  renderBtn.addEventListener('click', () => {
    if (typeof window.renderGraphFromTextarea === 'function') {
      window.renderGraphFromTextarea();
      return;
    }

    logger.error('renderGraphFromTextarea is not available on window.');
    alert('Render function is not available. Expose renderGraphFromTextarea on window or move this listener into jsonld-visualizer-ui.js.');
  });
}

document.addEventListener('DOMContentLoaded', setupJsonLdVisualizerLoader);
