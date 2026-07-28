import {
  getPreferredExtensionForMimeType,
  getSupportedMimeTypeForFilename,
  normalizeSupportedMimeType
} from '../docs/app/shared/format-registry/mime-registry.js';
import {
  COMMON_NAMESPACE_IRIS,
  iriForNamespaceId,
  namespacePrefixMapFromRegistry
} from '../docs/app/shared/namespace-registry/namespace-registry.js';

describe('shared format registry', () => {
  test('resolves RDF and visualization-adjacent file formats consistently', () => {
    expect(getSupportedMimeTypeForFilename('example.nt')).toMatchObject({
      ok: true,
      value: { id: 'nTriples', mimeType: 'application/n-triples', category: 'rdf' }
    });
    expect(normalizeSupportedMimeType('application/ld+json')).toMatchObject({
      ok: true,
      value: { id: 'jsonLd', mimeType: 'application/ld+json' }
    });
    expect(getPreferredExtensionForMimeType('text/turtle')).toEqual({
      ok: true,
      value: 'ttl'
    });
  });

  test('returns explicit failures for unsupported extensions', () => {
    expect(getSupportedMimeTypeForFilename('diagram.gv')).toEqual({
      ok: false,
      error: 'unknown filetype',
      input: 'diagram.gv',
      extension: 'gv'
    });
  });
});

describe('shared namespace registry', () => {
  test('replaces duplicated RDF namespace constants with generated registry IRIs', () => {
    expect(COMMON_NAMESPACE_IRIS.rdf.type).toBe('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
    expect(COMMON_NAMESPACE_IRIS.rdfs.label).toBe('http://www.w3.org/2000/01/rdf-schema#label');
    expect(COMMON_NAMESPACE_IRIS.owl.Class).toBe('http://www.w3.org/2002/07/owl#Class');
    expect(COMMON_NAMESPACE_IRIS.skos.prefLabel).toBe('http://www.w3.org/2004/02/skos/core#prefLabel');
  });

  test('derives prefix maps and single IRIs from the registry', () => {
    expect(namespacePrefixMapFromRegistry()).toMatchObject({
      rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
      rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
      owl: 'http://www.w3.org/2002/07/owl#'
    });
    expect(iriForNamespaceId('dcterms', 'title')).toEqual({
      ok: true,
      value: 'http://purl.org/dc/terms/title'
    });
  });
});
