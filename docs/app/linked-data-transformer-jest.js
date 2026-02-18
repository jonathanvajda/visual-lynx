// @jest-environment jsdom
import { JSDOM } from 'jsdom';

// Mocks and dependencies
const $rdf = require('rdflib');
const {
  parseRDF,
  serializeRDF,
  rdfToMermaid,
  rdfToD3JSON
} = require('./rdf_transformer_logic');

const baseIRI = 'http://example.org/';

const turtleSample = `
@prefix ex: <http://example.org/> .
ex:a ex:b ex:c .
`;

describe('RDF Transformer Logic', () => {
  test('parseRDF parses valid Turtle input', () => {
    const store = parseRDF(turtleSample, 'text/turtle', baseIRI);
    expect(store.statements.length).toBeGreaterThan(0);
  });

  test('serializeRDF serializes to Turtle', () => {
    const store = parseRDF(turtleSample, 'text/turtle', baseIRI);
    const result = serializeRDF(store, 'text/turtle', baseIRI);
    expect(typeof result).toBe('string');
    expect(result).toContain('a b c');
  });

  test('rdfToMermaid generates Mermaid syntax', () => {
    const store = parseRDF(turtleSample, 'text/turtle', baseIRI);
    const result = rdfToMermaid(store);
    expect(result).toContain('graph TD');
    expect(result).toContain('--');
  });

  test('rdfToD3JSON returns valid nodes and links', () => {
    const store = parseRDF(turtleSample, 'text/turtle', baseIRI);
    const result = rdfToD3JSON(store);
    expect(Array.isArray(result.nodes)).toBe(true);
    expect(Array.isArray(result.links)).toBe(true);
    expect(result.links[0]).toHaveProperty('source');
    expect(result.links[0]).toHaveProperty('target');
    expect(result.links[0]).toHaveProperty('predicate');
  });

  test('parseRDF throws on bad input', () => {
    expect(() => parseRDF('invalid content', 'text/turtle')).toThrow();
  });

  test('serializeRDF throws on unknown store', () => {
    expect(() => serializeRDF({}, 'text/turtle')).toThrow();
  });
});
