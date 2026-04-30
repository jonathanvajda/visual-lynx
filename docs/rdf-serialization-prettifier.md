# Sugar Serial: RDF Serialization Prettifier

The RDF serialization sugar helpers are browser-friendly modules for adding OWLAPI-inspired organization to RDF serializations after a normal RDF transformation step.

The code is split by serialization engine:

- `docs/app/n3-sugar-serial.js` owns N3.js-supported serializations: Turtle, TriG, N-Triples, and N-Quads.
- `docs/app/rdflib-sugar-serial.js` owns RDFLib/RDF-XML behavior, including XML repairs.

These modules are intentionally separate from the linked-data transformer core and UI modules so other tools can reuse them without adopting the linked-data transformer interface.

## Load Order

Load the RDF libraries first, then the sugar modules, then the tool that calls them:

```html
<script src="./app/n3.min.js"></script>
<script src="./app/rdflib.min.js"></script>
<script src="./app/n3-sugar-serial.js"></script>
<script src="./app/rdflib-sugar-serial.js"></script>
```

`N3.js` is required for Turtle, TriG, N-Triples, and N-Quads prettification. RDF/XML prettification uses browser `DOMParser` and `XMLSerializer`.

## API

The focused modules expose two global objects:

```js
window.N3SugarSerial
window.RdflibSugarSerial
```

### `supportsInlineComments(mimeType)`

Returns `true` for output formats where inline comments are allowed:

```js
const canPrettify = window.N3SugarSerial.supports('text/turtle');
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
const result = window.N3SugarSerial.prettify({
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

Prefixes from the source document are preferred over the helper's built-in fallback prefixes. If a source file uses `dct:` for `http://purl.org/dc/terms/`, the helper should not also emit its fallback `dcterms:` prefix for the same namespace.

For TriG with named graphs, the helper currently returns the original serialization and a warning so it does not erase graph names.

For N-Triples and N-Quads, the helper can add comment headers and sort/group lines, but it keeps the line-based serialization style. These formats do not support prefixes or compact multi-predicate subject blocks.

For RDF/XML, the helper inserts XML comment section headers and sorts top-level OWL entity elements when the RDF/XML contains direct OWL elements such as `<owl:Class>` or `<owl:ObjectProperty>`. RDF/XML emitted only as generic `<rdf:Description>` nodes is placed under extra axioms because the element type is not visible without reinterpreting the graph.

The RDF/XML formatter also repairs a narrow serializer artifact where `rdf:parseType="Resource"` incorrectly wraps a single typed anonymous node such as `<owl:Class>`, `<owl:Restriction>`, or `<rdf:Description>`. Leaving that pattern intact causes OWL tooling to read the typed node element as a predicate instead of an anonymous class expression.

Literal-only RDF/XML elements are kept inline, for example `<rdfs:label>Example</rdfs:label>`, so pretty-printing does not add indentation whitespace to annotation literal values.

If the upstream serializer emits an unqualified property element such as `<style>` for a predicate in the base namespace, the formatter adds an explicit prefix and namespace declaration, for example `<base:style>`, so the result remains valid RDF/XML. Unqualified HTML-like elements inside `rdf:parseType="Literal"` content are treated as XHTML literal markup instead.

The linked data transformer also applies this unqualified-element repair before parsing RDF/XML input, because rdflib rejects bare elements with errors such as `No namespace for style` or `No namespace for html`. If the document root is `<html>`, the tool reports that the selected file appears to be an HTML page rather than a raw ontology file.

## Integration Pattern

A reusable wrapper usually looks like this:

```js
let serialized = await serializeRdfSomehow();
const sugarSerial = [
  window.N3SugarSerial,
  window.RdflibSugarSerial,
].find((module) => module?.supports?.(outputMime));

if (sugarSerial) {
  const pretty = sugarSerial.prettify({
    text: serialized,
    mimeType: outputMime,
    baseIRI,
    logger: console,
  });
  serialized = pretty.text;
}
```

For UI tools, pair this with a checkbox that is enabled only when `supportsInlineComments(outputMime)` returns `true`.
