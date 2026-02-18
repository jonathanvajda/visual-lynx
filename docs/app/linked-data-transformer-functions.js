
// Checks if the XML is RDF-XML vs OWL-XML
const normalizeMimeType = (mimeType) => {
  return mimeType === 'application/owl+xml' ? 'application/rdf+xml' : mimeType;
};


// Parses RDF content from text using rdflib.js
// Returns an rdflib graph object or throws an error
const parseRDF = (rdfText, mimeType, baseIRI = 'http://example.org/') => {
  try {
    const normType = normalizeMimeType(mimeType);
    console.info(`Parsing RDF content as: ${normType}`);
    const store = $rdf.graph();
    $rdf.parse(rdfText, store, baseIRI, normType);
    return store;
  } catch (error) {
    console.error('Failed to parse RDF:', error);
    throw new Error('RDF parsing error');
  }
};

// Converts RDF graph to Mermaid flowchart format
const rdfToMermaid = (store) => {
  try {
    console.info('Converting RDF to Mermaid format');
    let output = 'graph TD\n';
    store.statements.forEach(stmt => {
      const subj = stmt.subject.value;
      const pred = stmt.predicate.value;
      const obj = stmt.object.value;
      output += `  "${subj}" -- "${pred}" --> "${obj}"\n`;
    });
    return output;
  } catch (error) {
    console.error('Error generating Mermaid output:', error);
    throw new Error('Mermaid conversion error');
  }
};

// Converts RDF graph to a basic D3.js-compatible JSON structure
const rdfToD3JSON = (store) => {
  try {
    console.info('Converting RDF to D3 JSON format');
    const nodes = new Set();
    const links = [];

    store.statements.forEach(stmt => {
      nodes.add(stmt.subject.value);
      nodes.add(stmt.object.value);
      links.push({ source: stmt.subject.value, target: stmt.object.value, predicate: stmt.predicate.value });
    });

    return {
      nodes: Array.from(nodes).map(n => ({ id: n, name: n })),
      links
    };
  } catch (error) {
    console.error('Error generating D3 JSON output:', error);
    throw new Error('D3 JSON conversion error');
  }
};

// Converts Mermaid-style nodes and edges to RDF
const mermaidToRDF = (nodes, edges, baseIRI = 'http://example.org/') => {
  try {
    console.info('Converting Mermaid nodes and edges to RDF');
    const store = $rdf.graph();
    const ns = $rdf.Namespace(baseIRI);

    nodes.forEach((node) => {
      const iri = ns(encodeURIComponent(node));
      store.add($rdf.sym(iri), $rdf.sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), $rdf.sym(baseIRI + 'Node'));
    });

    edges.forEach((edge) => {
      const subj = ns(encodeURIComponent(edge.source));
      const pred = ns(encodeURIComponent(edge.label || edge.type || 'relatedTo'));
      const obj = ns(encodeURIComponent(edge.target));
      store.add($rdf.sym(subj), $rdf.sym(pred), $rdf.sym(obj));
    });

    return store;
  } catch (error) {
    console.error('Error converting Mermaid to RDF:', error);
    throw new Error('Mermaid to RDF conversion error');
  }
};

// Serializes an rdflib graph object to a string using rdflib.js or custom formatter
const serializeRDF = (store, mimeType, baseIRI = 'http://example.org/') => {
  try {
    const normType = normalizeMimeType(mimeType);
    console.info(`Serializing RDF to format: ${normType}`);
    if (normType === 'text/x-mermaid') {
      return rdfToMermaid(store);
    } else if (normType === 'application/json-d3') {
      return JSON.stringify(rdfToD3JSON(store), null, 2);
    } else {
      return $rdf.serialize(null, store, baseIRI, normType);
    }
  } catch (error) {
    console.error('Failed to serialize RDF:', error);
    throw new Error('RDF serialization error');
  }
};


// Reads a file as text asynchronously
// Returns a Promise resolving to file text or rejects with error
const readFileAsText = (file) => {
  return new Promise((resolve, reject) => {
    console.info('Reading file:', file.name);
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = (e) => {
      console.error('File reading error:', e);
      reject(new Error('Could not read file'));
    };
    reader.readAsText(file);
  });
};

// Initiates download of content as a file with specified name
const downloadContent = (filename, content) => {
  try {
    console.info('Initiating download:', filename);
    const blob = new Blob([content], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (error) {
    console.error('Download failed:', error);
    throw new Error('Download error');
  }
};


// Extracts selected radio button value from a group
const getSelectedRadioValue = (groupName) => {
  try {
    const selected = document.querySelector(`input[name="${groupName}"]:checked`);
    if (!selected) throw new Error(`No ${groupName} selected`);
    return selected.value;
  } catch (error) {
    console.error(`Error getting selected radio for ${groupName}:`, error);
    throw error;
  }
};

// Main transform function to convert RDF between formats
const transformRDF = async (file, inputFormat, outputFormat) => {
  try {
    const rdfText = await readFileAsText(file);
    const graph = parseRDF(rdfText, inputFormat);
    const serialized = serializeRDF(graph, outputFormat);
    console.info('Transformation successful');
    return serialized;
  } catch (error) {
    console.error('Transformation failed:', error);
    throw error;
  }
};

// Update handlers with dynamic output filtering
const setupEventHandlers = () => {
  const fileInput = document.getElementById('fileInput');
  const transformBtn = document.getElementById('transformBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const outputArea = document.getElementById('outputArea');
  const inputRadios = document.querySelectorAll('input[name="input"]');

  let transformedText = '';

  inputRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      updateOutputOptions(radio.value);
    });
  });

  // Guess MIME type from file extension and set input radio
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    const match = Object.entries(extensionToMime).find(([ext]) => lowerName.endsWith(ext));
    if (match) {
        const mime = match[1];
        const radio = document.querySelector(`input[name="input"][value="${mime}"]`);
        if (radio) {
        radio.checked = true;
        updateOutputOptions(mime);
        console.info(`Auto-selected input format based on extension: ${mime}`);
        }
    }
    });

  transformBtn.onclick = async () => {
    try {
      const file = fileInput.files[0];
      if (!file) throw new Error('No file selected');

      const inputFormat = getSelectedRadioValue('input');
      const outputFormat = getSelectedRadioValue('output');
      transformedText = await transformRDF(file, inputFormat, outputFormat);
      outputArea.value = transformedText;
    } catch (error) {
      outputArea.value = `Error: ${error.message}`;
    }
  };

  downloadBtn.onclick = () => {
    try {
      if (!transformedText) throw new Error('No transformed content');
      downloadContent('transformed_output.txt', transformedText);
    } catch (error) {
      alert(`Download Error: ${error.message}`);
    }
  };
};

// Initialize handlers after DOM is loaded
window.onload = () => {
  console.info('Initializing RDF Transformer');
  setupEventHandlers();
};


// Compatibility matrix of input to valid output MIME types
const formatCompatibilityMatrix = {
  'application/n-triples': [
    'application/n-triples', 'text/turtle', 'application/ld+json',
    'application/rdf+xml', 'application/owl+xml', 'application/trig',
    'text/x-mermaid', 'application/json-d3'
  ],
  'text/turtle': [
    'application/n-triples', 'text/turtle', 'application/ld+json',
    'application/rdf+xml', 'application/owl+xml', 'application/trig',
    'text/x-mermaid', 'application/json-d3'
  ],
  'application/ld+json': [
    'application/n-triples', 'text/turtle', 'application/ld+json',
    'application/rdf+xml', 'application/owl+xml', 'application/trig',
    'text/x-mermaid', 'application/json-d3'
  ],
  'application/rdf+xml': [
    'application/n-triples', 'text/turtle', 'application/ld+json',
    'application/rdf+xml', 'application/owl+xml', 'application/trig',
    'text/x-mermaid', 'application/json-d3'
  ],
  'application/owl+xml': [
    'application/n-triples', 'text/turtle', 'application/ld+json',
    'application/rdf+xml', 'application/owl+xml', 'application/trig',
    'text/x-mermaid', 'application/json-d3'
  ],
  'application/trig': [
    'application/n-triples', 'text/turtle', 'application/ld+json',
    'application/rdf+xml', 'application/owl+xml', 'application/trig',
    'text/x-mermaid', 'application/json-d3'
  ]
};

// Maps file extensions to rdflib-compatible MIME types
const extensionToMime = {
  '.ttl': 'text/turtle',
  '.nt': 'application/n-triples',
  '.rdf': 'application/rdf+xml',
  '.owl': 'application/owl+xml',
  '.jsonld': 'application/ld+json',
  '.trig': 'application/trig'
};


// Updates output format radio buttons based on selected input format
const updateOutputOptions = (inputFormat) => {
  try {
    const allowedOutputs = formatCompatibilityMatrix[inputFormat] || [];
    const outputRadios = document.querySelectorAll('input[name="output"]');
    outputRadios.forEach(radio => {
      if (allowedOutputs.includes(radio.value)) {
        radio.disabled = false;
        radio.parentElement.style.opacity = '1';
      } else {
        radio.disabled = true;
        radio.parentElement.style.opacity = '0.4';
      }
    });
  } catch (error) {
    console.warn('Could not update output options:', error);
  }
};

