// docs/app/linked-data-transformer-main.js

import {
  normalizeMimeType,
  supportedConversions,
  guessInputMimeFromFilename,
  getDownloadExtension,
} from './linked-data-transformer-registry.js';

import { createTransformer } from './linked-data-transformer-core.js';
import { readFileAsText, downloadContent } from './linked-data-transformer-browser.js';

/* ------------------------- Logging helpers ------------------------- */
const makeLogger = (scope = 'ldt') => ({
  info: (...args) => console.info(`[${scope}]`, ...args),
  warn: (...args) => console.warn(`[${scope}]`, ...args),
  error: (...args) => console.error(`[${scope}]`, ...args),
});

/* ------------------------- UI utilities ------------------------- */
function getSelectedRadioValue(groupName) {
  const selected = document.querySelector(`input[name="${groupName}"]:checked`);
  return selected ? selected.value : null;
}

function setSelectedRadioValue(groupName, value) {
  const radio = document.querySelector(`input[name="${groupName}"][value="${value}"]`);
  if (radio) radio.checked = true;
}

function updateOutputOptions({ inputMime, logger }) {
  const supported = supportedConversions[normalizeMimeType(inputMime)] || [];
  const outputs = document.querySelectorAll('input[name="output"]');

  outputs.forEach((o) => {
    const isAllowed = supported.includes(normalizeMimeType(o.value));
    o.disabled = !isAllowed;

    const wrapper = o.parentElement;
    if (wrapper) wrapper.style.opacity = isAllowed ? '1' : '0.45';
  });

  const current = getSelectedRadioValue('output');
  if (!current || !supported.includes(normalizeMimeType(current))) {
    if (supported.length) setSelectedRadioValue('output', supported[0]);
  }

  logger.info('Updated output options for input:', inputMime, 'Allowed:', supported);
}

function setupEventHandlers() {
  const logger = makeLogger('ldt');

  const transformer = createTransformer({
    N3: window.N3,
    jsonld: window.jsonld,
    $rdf: window.$rdf,
  });

  const fileInput = document.getElementById('fileInput');
  const transformBtn = document.getElementById('transformBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const outputArea = document.getElementById('outputArea');

  if (!fileInput || !transformBtn || !downloadBtn || !outputArea) {
    logger.error('Missing expected DOM elements.');
    return;
  }

  logger.info('Libraries present:', {
    N3: !!window.N3,
    jsonld: !!window.jsonld,
    rdflib: !!window.$rdf,
  });

  let lastOutput = '';
  let lastOutputMime = 'text/plain';

  document.querySelectorAll('input[name="input"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      updateOutputOptions({ inputMime: radio.value, logger });
    });
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    const guessed = guessInputMimeFromFilename(file.name);
    if (guessed) {
      setSelectedRadioValue('input', guessed);
      updateOutputOptions({ inputMime: guessed, logger });
      logger.info('Auto-selected input format:', guessed);
    } else {
      logger.warn('Could not guess input format from extension:', file.name);
    }
  });

  transformBtn.addEventListener('click', async () => {
    try {
      const file = fileInput.files && fileInput.files[0];
      const inputMime = getSelectedRadioValue('input');
      const outputMime = getSelectedRadioValue('output');
      const baseIRI = 'http://example.org/';

      if (!file) throw new Error('No file selected');

      const text = await readFileAsText(file);

      const out = await transformer.transformText({
        text,
        inputMime,
        outputMime,
        baseIRI,
        logger,
      });

      outputArea.value = out;
      lastOutput = out;
      lastOutputMime = outputMime;

      logger.info('Transformation successful.');
    } catch (e) {
      outputArea.value = '';
      logger.error('Transform error:', e);
      alert(`Transformation failed: ${e?.message || String(e)}`);
    }
  });

  downloadBtn.addEventListener('click', () => {
    try {
      if (!lastOutput) {
        alert('Nothing to download yet. Run a transformation first.');
        return;
      }

      const ext = getDownloadExtension(lastOutputMime);

      downloadContent({
        content: lastOutput,
        filename: `transformed.${ext}`,
        mimeType: lastOutputMime,
      });
    } catch (e) {
      logger.error('Download error:', e);
      alert(`Download failed: ${e?.message || String(e)}`);
    }
  });

  const initialInput = getSelectedRadioValue('input') || 'text/turtle';
  setSelectedRadioValue('input', initialInput);
  updateOutputOptions({ inputMime: initialInput, logger });
}

document.addEventListener('DOMContentLoaded', setupEventHandlers);