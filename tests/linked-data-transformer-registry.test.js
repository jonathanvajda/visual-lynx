import {
  extensionToMime,
  getDownloadExtension,
  guessInputMimeFromFilename,
  normalizeMimeType,
  supportedConversions
} from '../docs/app/linked-data-transformer-registry.js';

describe('linked data transformer format registry', () => {
  test('normalizes RDF MIME aliases through the shared format registry', () => {
    expect(normalizeMimeType('ttl')).toBe('text/turtle');
    expect(normalizeMimeType('jsonld')).toBe('application/ld+json');
    expect(normalizeMimeType('rdfxml')).toBe('application/rdf+xml');
    expect(normalizeMimeType('application/n-triples')).toBe('application/n-triples');
  });

  test('keeps visualization-only output aliases available to Visual Lynx', () => {
    expect(normalizeMimeType('mermaid')).toBe('text/mermaid');
    expect(normalizeMimeType('d3json')).toBe('application/d3+json');
    expect(getDownloadExtension('text/mermaid')).toBe('mmd');
    expect(getDownloadExtension('application/d3+json')).toBe('json');
  });

  test('guesses supported RDF input formats from filenames', () => {
    expect(guessInputMimeFromFilename('graph.ttl')).toBe('text/turtle');
    expect(guessInputMimeFromFilename('graph.json')).toBe('application/ld+json');
    expect(guessInputMimeFromFilename('ontology.owl')).toBe('application/rdf+xml');
    expect(guessInputMimeFromFilename('spreadsheet.csv')).toBeNull();
  });

  test('declares conversion outputs for each supported RDF input format', () => {
    expect(extensionToMime['.trig']).toBe('application/trig');
    expect(supportedConversions['text/turtle']).toEqual(expect.arrayContaining([
      'application/n-triples',
      'application/ld+json',
      'application/rdf+xml',
      'text/mermaid',
      'application/d3+json'
    ]));
  });

  test('falls back predictably for unknown MIME types', () => {
    expect(normalizeMimeType('application/x-custom')).toBe('application/x-custom');
    expect(getDownloadExtension('application/x-custom')).toBe('txt');
  });
});
