// docs/app/linked-data-transformer-main.js

import {
  normalizeMimeType,
  supportedConversions,
  guessInputMimeFromFilename,
  getDownloadExtension,
} from './linked-data-transformer-registry.js';

import { createTransformer } from './linked-data-transformer-core.js';
import { downloadTextFile, readFileAsText } from './shared/browser-file-io/index.js';
import { createScopedConsoleLogger } from './shared/ui-feedback/index.js';

/* ------------------------- Logging helpers ------------------------- */
const makeLogger = (scope = 'ldt') => {
  const logger = createScopedConsoleLogger({ scope });
  return {
    info: (...args) => logger.info(String(args.shift() ?? 'event'), args),
    warn: (...args) => logger.warn(String(args.shift() ?? 'event'), args),
    error: (...args) => logger.error(String(args.shift() ?? 'event'), args),
  };
};

/* ------------------------- UI utilities ------------------------- */
function getSelectedRadioValue(groupName) {
  const selected = document.querySelector(`input[name="${groupName}"]:checked`);
  return selected ? selected.value : null;
}

function setSelectedRadioValue(groupName, value) {
  const radio = document.querySelector(`input[name="${groupName}"][value="${value}"]`);
  if (radio) radio.checked = true;
}

function getSugarSerial(mimeType) {
  const mime = normalizeMimeType(mimeType);
  return [
    window.N3SugarSerial,
    window.RdflibSugarSerial,
  ].find((module) => module?.supports?.(mime)) || null;
}

function updatePrettifierOption({ outputMime }) {
  const checkbox = document.getElementById('prettifyRdfOutput');
  if (!checkbox) return;

  const sugarSerial = getSugarSerial(outputMime);
  const isSupported = !!sugarSerial;

  checkbox.disabled = !isSupported;

  const wrapper = checkbox.parentElement;
  if (wrapper) wrapper.style.opacity = isSupported ? '1' : '0.45';
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

  updatePrettifierOption({ outputMime: getSelectedRadioValue('output') });
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
  const prettifyCheckbox = document.getElementById('prettifyRdfOutput');

  if (!fileInput || !transformBtn || !downloadBtn || !outputArea) {
    logger.error('Missing expected DOM elements.');
    return;
  }

  logger.info('Libraries present:', {
    N3: !!window.N3,
    jsonld: !!window.jsonld,
    rdflib: !!window.$rdf,
    n3SugarSerial: !!window.N3SugarSerial,
    rdflibSugarSerial: !!window.RdflibSugarSerial,
  });

  let lastOutput = '';
  let lastOutputMime = 'text/plain';

  document.querySelectorAll('input[name="input"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      updateOutputOptions({ inputMime: radio.value, logger });
    });
  });

  document.querySelectorAll('input[name="output"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      updatePrettifierOption({ outputMime: radio.value });
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

      let out = await transformer.transformText({
        text,
        inputMime,
        outputMime,
        baseIRI,
        logger,
      });

      const sugarSerial = getSugarSerial(outputMime);
      const shouldPrettify = !!(
        sugarSerial &&
        prettifyCheckbox &&
        prettifyCheckbox.checked &&
        !prettifyCheckbox.disabled
      );

      if (shouldPrettify) {
        const result = sugarSerial.prettify({
          text: out,
          mimeType: outputMime,
          sourceText: text,
          sourceMimeType: inputMime,
          baseIRI,
          logger,
        });

        out = result.text;
        if (!result.applied && result.warnings?.length) {
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

      downloadTextFile(`transformed.${ext}`, lastOutput, { mimeType: lastOutputMime });
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
