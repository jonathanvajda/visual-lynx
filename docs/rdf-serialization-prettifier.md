# RDF Serialization Prettifier

`docs/app/rdf-serialization-prettifier.js` is a browser-friendly helper for adding OWLAPI-inspired organization to RDF serializations after a normal RDF transformation step.

It is intentionally separate from `linked-data-transformer-functions.js` so other tools can reuse it without adopting the linked-data transformer UI.

## Load Order

Load the RDF libraries first, then the prettifier, then the tool that calls it:

```html
<script src="./app/n3.min.js"></script>
<script src="./app/rdflib.min.js"></script>
<script src="./app/rdf-serialization-prettifier.js"></script>
```

`N3.js` is required for Turtle, TriG, N-Triples, and N-Quads prettification. RDF/XML prettification uses browser `DOMParser` and `XMLSerializer`.

## API

The file exposes one global object:

```js
window.RdfSerilalizationPrettifier
```

### `supportsInlineComments(mimeType)`

Returns `true` for output formats where inline comments are allowed:

```js
const canPrettify = window.RdfSerilalizationPrettifier.supportsInlineComments('text/turtle');
```

Supported comment-capable formats:

- `text/turtle`
- `application/trig`
- `application/n-triples`
- `application/n-quads`
- `application/rdf+xml`

JSON-LD is intentionally excluded because JSON does not support comments.

### `prettify({ text, mimeType, baseIRI, logger })`

Returns an object:

```js
{
  text: '...',
  applied: true,
  warnings: []
}
```

Example:

```js
const result = window.RdfSerilalizationPrettifier.prettify({
  text: serializedRdf,
  mimeType: 'text/turtle',
  baseIRI: 'https://example.org/my-ontology',
  logger: console,
});

const output = result.text;
```

If the helper cannot parse or organize the serialization, it returns the original text with `applied: false` and a warning. This makes it safe to use as a wrapper around existing serialization code.

## Output Behavior

For Turtle and default-graph-only TriG, the helper:

- emits namespace prefixes at the top
- emits `@base` when available
- puts the ontology node before entity sections
- adds OWLAPI-style section comment blocks
- groups subjects into:
  - Annotation properties
  - Object Properties
  - Data properties
  - Classes
  - Individuals
  - Extra annotations
  - Extra axioms
- sorts subjects by rendered name
- sorts predicates alphabetically by rendered predicate

For TriG with named graphs, the helper currently returns the original serialization and a warning so it does not erase graph names.

For N-Triples and N-Quads, the helper can add comment headers and sort/group lines, but it keeps the line-based serialization style. These formats do not support prefixes or compact multi-predicate subject blocks.

For RDF/XML, the helper inserts XML comment section headers and sorts top-level OWL entity elements when the RDF/XML contains direct OWL elements such as `<owl:Class>` or `<owl:ObjectProperty>`. RDF/XML emitted only as generic `<rdf:Description>` nodes is placed under extra axioms because the element type is not visible without reinterpreting the graph.

## Integration Pattern

A reusable wrapper usually looks like this:

```js
let serialized = await serializeRdfSomehow();

if (window.RdfSerilalizationPrettifier.supportsInlineComments(outputMime)) {
  const pretty = window.RdfSerilalizationPrettifier.prettify({
    text: serialized,
    mimeType: outputMime,
    baseIRI,
    logger: console,
  });
  serialized = pretty.text;
}
```

For UI tools, pair this with a checkbox that is enabled only when `supportsInlineComments(outputMime)` returns `true`.
