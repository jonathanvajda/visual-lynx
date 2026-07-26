// ./docs/app/linked-data-transformer-registry.js
import {
  getPreferredExtensionForMimeType,
  getSupportedMimeTypeForFilename,
  normalizeSupportedMimeType
} from './shared/format-registry/mime-registry.js';

export function normalizeMimeType(mimeType) {
  const normalized = normalizeSupportedMimeType(mimeType);
  if (normalized?.ok) return normalized.value.mimeType;

  const lower = (mimeType || '').toString().trim().toLowerCase();

  if (!lower) return '';

  if (lower === 'owl' || lower === 'rdf' || lower === 'rdfxml' || lower === 'application/rdf+xml') {
    return 'application/rdf+xml';
  }
  if (lower === 'ttl' || lower === 'turtle' || lower === 'text/turtle') {
    return 'text/turtle';
  }
  if (lower === 'nt' || lower === 'ntriples' || lower === 'n-triples' || lower === 'application/n-triples') {
    return 'application/n-triples';
  }
  if (lower === 'trig' || lower === 'application/trig') {
    return 'application/trig';
  }
  if (lower === 'jsonld' || lower === 'json-ld' || lower === 'application/ld+json') {
    return 'application/ld+json';
  }
  if (lower === 'mermaid' || lower === 'text/mermaid') {
    return 'text/mermaid';
  }
  if (lower === 'd3' || lower === 'd3json' || lower === 'application/d3+json') {
    return 'application/d3+json';
  }

  return mimeType;
}

export const extensionToMime = Object.freeze({
  '.nt': 'application/n-triples',
  '.ttl': 'text/turtle',
  '.turtle': 'text/turtle',
  '.trig': 'application/trig',
  '.jsonld': 'application/ld+json',
  '.json-ld': 'application/ld+json',
  '.json': 'application/ld+json',
  '.rdf': 'application/rdf+xml',
  '.owl': 'application/rdf+xml',
  '.xml': 'application/rdf+xml',
});

export function guessInputMimeFromFilename(filename) {
  const detected = getSupportedMimeTypeForFilename(filename);
  if (detected?.ok && detected.value.category === 'rdf') return detected.value.mimeType;

  const lower = (filename || '').toLowerCase();
  const match = Object.entries(extensionToMime).find(([ext]) => lower.endsWith(ext));
  return match ? match[1] : null;
}

export function getDownloadExtension(mimeType) {
  const preferred = getPreferredExtensionForMimeType(mimeType);
  if (preferred?.ok) return preferred.value;

  const normalized = normalizeMimeType(mimeType);
  return ({
    'application/n-triples': 'nt',
    'text/turtle': 'ttl',
    'application/trig': 'trig',
    'application/ld+json': 'jsonld',
    'application/rdf+xml': 'rdf',
    'text/mermaid': 'mmd',
    'application/d3+json': 'json',
  })[normalized] || 'txt';
}

export const supportedConversions = Object.freeze({
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
