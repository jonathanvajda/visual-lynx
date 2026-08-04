describe('JSON-LD visualizer graph input normalization', () => {
  beforeAll(async () => {
    globalThis.window = { MyFunctions: {} };
    await import('../docs/app/jsonld-visualizer-core.js');
  });

  test('accepts JSON-LD arrays, @graph documents, and single node objects', () => {
    const node = { '@id': 'http://example.org/A', '@type': ['http://www.w3.org/2002/07/owl#Class'] };

    expect(window.MyFunctions.normalizeJsonLdGraphInput([node])).toEqual([node]);
    expect(window.MyFunctions.normalizeJsonLdGraphInput({ '@context': {}, '@graph': [node] })).toEqual([node]);
    expect(window.MyFunctions.normalizeJsonLdGraphInput(node)).toEqual([node]);
  });

  test('generates a graph from a JSON-LD document object with @graph', () => {
    const graph = window.MyFunctions.generateEntityGraphFromRDFRepresentation({
      '@context': {},
      '@graph': [
        {
          '@id': 'http://example.org/A',
          '@type': ['http://www.w3.org/2002/07/owl#Class'],
          'http://www.w3.org/2000/01/rdf-schema#label': [{ '@value': 'A' }]
        }
      ]
    });

    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0].id).toBe('http://example.org/A');
  });
});
