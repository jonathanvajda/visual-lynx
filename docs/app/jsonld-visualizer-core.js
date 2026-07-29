// ./docs/app/jsonld-visualizer-ui.js
import {
  COMMON_NAMESPACE_IRIS,
  namespacePrefixMapFromRegistry
} from './shared/namespace-registry/index.js';

window.MyFunctions = window.MyFunctions || {};
const MyFunctions = window.MyFunctions;
const NS = COMMON_NAMESPACE_IRIS;
const PREFIXES = namespacePrefixMapFromRegistry();

MyFunctions.inferJsonLdSchema = (jsonld, language = "en") => {
  /**
 * Infers a JSON-LD schema by:
 * 1. Extracting triples from JSON-LD.
 * 2. Building a class map.
 * 3. Building a property map.
 * 4. Inferring properties from NamedIndividuals.
 * 5. Merging inferred properties into class definitions.
 * 6. Adding preferred labels for each class (if available).
 *
 * @param {Array<Object>} jsonld - An array of JSON-LD nodes.
 * @param {string} [language="en"] - Preferred language for labels.
 * @returns {Array<Object>} The inferred schema graph.
 */
  const triples = MyFunctions.extractTriples(jsonld);
  console.log("Extracted Triples:", triples);

  const classMap = MyFunctions.getClassMap(triples);
  console.log("Class Map:", Array.from(classMap.entries()));

  const propMap = MyFunctions.getProperties(triples);
  console.log("Property Map:", Array.from(propMap.entries()));

  const inferredProps = MyFunctions.inferPropsFromIndividuals(jsonld, classMap);
  console.log("Inferred Properties:", Array.from(inferredProps.entries()));

  const schemaGraph = MyFunctions.mergePropsIntoClasses(classMap, propMap, inferredProps);
  console.log("Schema Graph Before Adding Labels:", schemaGraph);

const finalSchema = schemaGraph.map(cls => {
  const label = MyFunctions.getPreferredLabel(jsonld, cls["@id"], language);
  return label
    ? { 
        ...cls, 
        "rdfs:label": [
          { 
            "@value": label, 
            "@language": language 
          }
        ]
      }
    : cls;
});

  console.log("Final Schema Graph:", finalSchema);
  return finalSchema;
};


MyFunctions.inferPropertiesFromIndividuals2 = (jsonLd) => {
  /**
   * Infers properties from individuals and adds their type relations to their class.
   * Dynamically tracks and processes all predicates without hardcoding.
   * Returns all class definitions from the input JSON-LD.
   * @param {Array<Object>} jsonLd - An array of JSON-LD objects representing RDF data.
   * @returns {Array<Object>} A new array of JSON-LD class objects.
   * @throws {TypeError} If the input is not an array or contains invalid objects.
   */
  // Input validation
  if (!Array.isArray(jsonLd)) {
    throw new TypeError("Input must be an array of JSON-LD objects.");
  }
  if (!jsonLd.every((item) => typeof item === "object" && item !== null)) {
    throw new TypeError("All elements in the array must be non-null objects.");
  }

  console.log("Input JSON-LD:", jsonLd);

  // Create a map to store class definitions
  const classMap = new Map();

  // Create a map to store individuals and their properties
  const individualMap = new Map();

  // Populate maps
  jsonLd.forEach((item) => {
    if (item["@type"]?.includes(NS.owl.Class)) {
      console.log("Adding class to classMap:", item["@id"]);
      classMap.set(item["@id"], { ...item });
    } else if (item["@type"]?.includes(NS.owl.NamedIndividual)) {
      console.log("Adding individual to individualMap:", item["@id"]);
      individualMap.set(item["@id"], item);
    }
  });

  console.log("Class Map:", classMap);
  console.log("Individual Map:", individualMap);

  // Infer properties from individuals
  individualMap.forEach((individual) => {
    console.log("Processing individual:", individual["@id"]);
    individual["@type"].forEach((typeId) => {
      const classDefinition = classMap.get(typeId);
      if (classDefinition) {
        console.log("Found class definition for individual:", typeId);

        // Dynamically process all predicates of the individual
        Object.keys(individual).forEach((predicateKey) => {
          if (predicateKey === "@id" || predicateKey === "@type") return; // Skip metadata keys

          console.log("Processing predicate:", predicateKey);

          const predicateValues = individual[predicateKey];
          if (Array.isArray(predicateValues)) {
            predicateValues.forEach((predicateValue) => {
              const propertyDefinition = individualMap.get(predicateValue["@id"]);
              if (propertyDefinition) {
                console.log("Found instance relation:", predicateValue["@id"]);
                propertyDefinition["@type"]
                  .filter((type) => type !== NS.owl.NamedIndividual) // Exclude NamedIndividual type
                  .forEach((resolvedType) => {
                    if (
                      !classDefinition[predicateKey]?.some(
                        (existingProperty) => existingProperty["@id"] === resolvedType
                      )
                    ) {
                      console.log("Adding resolved type to class:", resolvedType);
                      classDefinition[predicateKey] = classDefinition[predicateKey] || [];
                      classDefinition[predicateKey].push({ "@id": resolvedType });
                    }
                  });
              }
            });
          }
        });
      }
    });
  });

  console.log("Final Class Map:", classMap);

  // Return all class definitions
  return Array.from(classMap.values());
};

MyFunctions.inferPropertiesFromIndividuals3 = (jsonLd) => {
  /**
   * Infers properties from individuals and adds their type relations to their class.
   * Dynamically tracks and processes all predicates without hardcoding.
   * @param {Array<Object>} jsonLd - An array of JSON-LD objects representing RDF data.
   * @returns {Array<Object>} A new array of updated JSON-LD class objects.
   * @throws {TypeError} If the input is not an array or contains invalid objects.
   */
  // Input validation
  if (!Array.isArray(jsonLd)) {
    throw new TypeError("Input must be an array of JSON-LD objects.");
  }
  if (!jsonLd.every((item) => typeof item === "object" && item !== null)) {
    throw new TypeError("All elements in the array must be non-null objects.");
  }

  console.log("Input JSON-LD:", jsonLd);

  // Create a map to store class definitions
  const classMap = new Map();

  // Create a map to store individuals and their properties
  const individualMap = new Map();

  // Populate maps
  jsonLd.forEach((item) => {
    if (item["@type"]?.includes(NS.owl.Class)) {
      console.log("Adding class to classMap:", item["@id"]);
      classMap.set(item["@id"], { ...item });
    } else if (item["@type"]?.includes(NS.owl.NamedIndividual)) {
      console.log("Adding individual to individualMap:", item["@id"]);
      individualMap.set(item["@id"], item);
    }
  });

  console.log("Class Map:", classMap);
  console.log("Individual Map:", individualMap);

  // Track updated classes
  const updatedClasses = new Set();

  // Infer properties from individuals
  individualMap.forEach((individual) => {
    console.log("Processing individual:", individual["@id"]);
    individual["@type"].forEach((typeId) => {
      const classDefinition = classMap.get(typeId);
      if (classDefinition) {
        console.log("Found class definition for individual:", typeId);

        // Dynamically process all predicates of the individual
        Object.keys(individual).forEach((predicateKey) => {
          if (predicateKey === "@id" || predicateKey === "@type") return; // Skip metadata keys

          console.log("Processing predicate:", predicateKey);

          const predicateValues = individual[predicateKey];
          if (Array.isArray(predicateValues)) {
            predicateValues.forEach((predicateValue) => {
              const propertyDefinition = individualMap.get(predicateValue["@id"]);
              if (propertyDefinition) {
                console.log("Found instance relation:", predicateValue["@id"]);
                propertyDefinition["@type"]
                  .filter((type) => type !== NS.owl.NamedIndividual) // Exclude NamedIndividual type
                  .forEach((resolvedType) => {
                    if (
                      !classDefinition[predicateKey]?.some(
                        (existingProperty) => existingProperty["@id"] === resolvedType
                      )
                    ) {
                      console.log("Adding resolved type to class:", resolvedType);
                      classDefinition[predicateKey] = classDefinition[predicateKey] || [];
                      classDefinition[predicateKey].push({ "@id": resolvedType });
                      updatedClasses.add(typeId); // Mark this class as updated
                    }
                  });
              }
            });
          }
        });
      }
    });
  });

  console.log("Final Class Map:", classMap);

  // Return only updated class definitions
  return Array.from(updatedClasses).map((classId) => classMap.get(classId));
};

MyFunctions.inferPropertiesFromIndividuals4 = (jsonLd) => {
  /**
   * Infers properties from individuals and adds their type relations to their class.
   * Dynamically tracks and processes all predicates without hardcoding.
   * @param {Array<Object>} jsonLd - An array of JSON-LD objects representing RDF data.
   * @returns {Array<Object>} A new array of updated JSON-LD class objects.
   * @throws {TypeError} If the input is not an array or contains invalid objects.
   */
  // Input validation
  if (!Array.isArray(jsonLd)) {
    throw new TypeError("Input must be an array of JSON-LD objects.");
  }
  if (!jsonLd.every((item) => typeof item === "object" && item !== null)) {
    throw new TypeError("All elements in the array must be non-null objects.");
  }

  console.log("Input JSON-LD:", jsonLd);

  // Create a map to store class definitions
  const classMap = new Map();

  // Create a map to store individuals and their properties
  const individualMap = new Map();

  // Populate maps
  jsonLd.forEach((item) => {
    if (item["@type"]?.includes(NS.owl.Class)) {
      console.log("Adding class to classMap:", item["@id"]);
      classMap.set(item["@id"], { ...item });
    } else if (item["@type"]?.includes(NS.owl.NamedIndividual)) {
      console.log("Adding individual to individualMap:", item["@id"]);
      individualMap.set(item["@id"], item);
    }
  });

  console.log("Class Map:", classMap);
  console.log("Individual Map:", individualMap);

  // Track updated classes
  const updatedClasses = new Set();

  // Infer properties from individuals
individualMap.forEach((individual) => {
  console.log("Processing individual:", individual["@id"]);
  individual["@type"].forEach((typeId) => {
    const classDefinition = classMap.get(typeId);
    if (classDefinition) {
      console.log("Found class definition for individual:", typeId);

      // Dynamically process all predicates of the individual
      Object.keys(individual).forEach((predicateKey) => {
        if (predicateKey === "@id" || predicateKey === "@type") return; // Skip metadata keys

        console.log("Processing predicate:", predicateKey);

        const predicateValues = individual[predicateKey];
        if (Array.isArray(predicateValues)) {
          predicateValues.forEach((predicateValue) => {
            const objectIndividual = individualMap.get(predicateValue["@id"]);
            if (objectIndividual) {
              console.log("Found instance relation:", predicateValue["@id"]);
              
              // Add object individual's class to updatedClasses
              objectIndividual["@type"]
                .filter((type) => type !== NS.owl.NamedIndividual) // Exclude NamedIndividual type
                .forEach((objectClassType) => {
                  if (!updatedClasses.has(objectClassType)) {
                    console.log("Adding object class to updatedClasses:", objectClassType);
                    updatedClasses.add(objectClassType);
                  }
                });

              objectIndividual["@type"]
                .filter((type) => type !== NS.owl.NamedIndividual) // Exclude NamedIndividual type
                .forEach((resolvedType) => {
                  if (
                    !classDefinition[predicateKey]?.some(
                      (existingProperty) => existingProperty["@id"] === resolvedType
                    )
                  ) {
                    console.log("Adding resolved type to class:", resolvedType);
                    classDefinition[predicateKey] = classDefinition[predicateKey] || [];
                    classDefinition[predicateKey].push({ "@id": resolvedType });
                    updatedClasses.add(typeId); // Mark this class as updated
                  }
                });
            }
          });
        }
      });
    }
  });
});

  console.log("Final Class Map:", classMap);

  // Return only updated class definitions
  return Array.from(updatedClasses).map((classId) => classMap.get(classId));
};


MyFunctions.CreateSchema = (jsonLd) => {
  /**
   * Infers properties from individuals and adds their type relations to their class.
   * Dynamically tracks and processes all predicates without hardcoding.
   * @param {Array<Object>} jsonLd - An array of JSON-LD objects representing RDF data.
   * @returns {Array<Object>} A new array of updated JSON-LD class objects.
   * @throws {TypeError} If the input is not an array or contains invalid objects.
   */
  // Input validation
  if (!Array.isArray(jsonLd)) {
    throw new TypeError("Input must be an array of JSON-LD objects.");
  }
  if (!jsonLd.every((item) => typeof item === "object" && item !== null)) {
    throw new TypeError("All elements in the array must be non-null objects.");
  }

  console.log("Input JSON-LD:", jsonLd);

  // Create a map to store class definitions
  const classMap = new Map();

  // Create a map to store individuals and their properties
  const individualMap = new Map();

  // Populate maps
  jsonLd.forEach((item) => {
    if (item["@type"]?.includes(NS.owl.Class)) {
      console.log("Adding class to classMap:", item["@id"]);
      classMap.set(item["@id"], { ...item });
    } else if (item["@type"]?.includes(NS.owl.NamedIndividual)) {
      console.log("Adding individual to individualMap:", item["@id"]);
      individualMap.set(item["@id"], item);
    }
  });

  console.log("Class Map:", classMap);
  console.log("Individual Map:", individualMap);

  // Track updated classes
  const updatedClasses = new Set();

  // Helper function to merge metadata
  const mergeMetadata = (originalClass, updates) => {
    Object.keys(updates).forEach((key) => {
      if (key === "@id" || key === "@type") return; // Skip metadata keys

      if (Array.isArray(updates[key])) {
        originalClass[key] = originalClass[key] || [];
        updates[key].forEach((updateItem) => {
          if (!originalClass[key].some((existingItem) => existingItem["@id"] === updateItem["@id"])) {
            originalClass[key].push(updateItem);
          }
        });
      } else {
        originalClass[key] = updates[key]; // For non-array properties, overwrite
      }
    });
    console.log(`Merged metadata for class ${originalClass["@id"]}:`, originalClass);
  };

  // Helper function to resolve types recursively
  const resolveTypes = (individual, classDefinition, predicateKey, visited = new Set()) => {
    const predicateValues = individual[predicateKey];
    console.log(`Predicate values for ${individual["@id"]} and key ${predicateKey}:`, predicateValues);

    if (Array.isArray(predicateValues)) {
      predicateValues.forEach((predicateValue) => {
        const referencedIndividual = individualMap.get(predicateValue["@id"]);
        console.log(`Referenced individual for ${predicateValue["@id"]}:`, referencedIndividual);

        if (referencedIndividual && !visited.has(referencedIndividual["@id"])) {
          visited.add(referencedIndividual["@id"]); // Prevent infinite recursion

          // Add the types of the referenced individual to the class
          referencedIndividual["@type"]
            .filter((type) => type !== NS.owl.NamedIndividual) // Exclude NamedIndividual type
            .forEach((resolvedType) => {
              if (
                !classDefinition[predicateKey]?.some(
                  (existingProperty) => existingProperty["@id"] === resolvedType
                )
              ) {
                console.log(`Adding resolved type to class ${classDefinition["@id"]}:`, resolvedType);
                classDefinition[predicateKey] = classDefinition[predicateKey] || [];
                classDefinition[predicateKey].push({ "@id": resolvedType });
                updatedClasses.add(classDefinition["@id"]); // Mark this class as updated
                console.log(`Updated class definition for ${classDefinition["@id"]}:`, classDefinition);
              }
            });

          // Ensure the object class is included in the final output
          referencedIndividual["@type"]
            .filter((type) => type !== NS.owl.NamedIndividual) // Exclude NamedIndividual type
            .forEach((objectClassId) => {
              if (classMap.has(objectClassId)) {
                const objectClass = classMap.get(objectClassId);
                mergeMetadata(objectClass, referencedIndividual); // Merge metadata for object class
                updatedClasses.add(objectClassId);
                console.log(`Ensuring object class ${objectClassId} is included in the output.`);
              }
            });

          // Recursively resolve types for nested individuals
          console.log(`Recursively resolving nested predicates for ${referencedIndividual["@id"]}`);
          Object.keys(referencedIndividual).forEach((nestedPredicateKey) => {
            if (nestedPredicateKey === "@id" || nestedPredicateKey === "@type") return; // Skip metadata keys
            resolveTypes(referencedIndividual, classDefinition, nestedPredicateKey, visited);
          });
        }
      });
    }
  };

  // Infer properties from individuals
  individualMap.forEach((individual) => {
    console.log("Processing individual:", individual["@id"]);
    individual["@type"].forEach((typeId) => {
      const classDefinition = classMap.get(typeId);
      if (classDefinition) {
        console.log("Found class definition for individual:", typeId);

        // Dynamically process all predicates of the individual
        Object.keys(individual).forEach((predicateKey) => {
          if (predicateKey === "@id" || predicateKey === "@type") return; // Skip metadata keys
          console.log("Processing predicate:", predicateKey);
          resolveTypes(individual, classDefinition, predicateKey);
        });
      }
    });
  });

  console.log("Final Class Map:", classMap);

  // Log final relationships for each class
  Array.from(updatedClasses).forEach((classId) => {
    console.log(`Final relationships for class ${classId}:`, classMap.get(classId));
  });

  // Return only updated class definitions
  return Array.from(updatedClasses).map((classId) => classMap.get(classId));
};

MyFunctions.inferPropsFromIndividuals = (jsonld, classMap) => {
  const NAMED_INDIVIDUAL = NS.owl.NamedIndividual;
  const DATATYPE_PROPERTY = NS.owl.DatatypeProperty;

  const predicateToDatatype = {
    [NS.cceo.hasTextValue]: "rdf:langString",
    [NS.cceo.hasIntegerValue]: "xsd:integer",
    [NS.cceo.hasDecimalValue]: "xsd:decimal",
    [NS.cceo.hasDateValue]: "xsd:date",
    [NS.cceo.hasDatetimeValue]: "xsd:dateTime",
    [NS.cceo.hasBooleanValue]: "xsd:boolean"
  };

  const normalizeDatatype = dt => {
    if (!dt || typeof dt !== 'string') return dt;
    if (/^[A-Za-z][\w.-]*:/.test(dt)) return dt;

    const mappings = [
      [PREFIXES.xsd, 'xsd:'],
      ['https://www.w3.org/2001/XMLSchema#', 'xsd:'],
      [PREFIXES.rdf, 'rdf:'],
      ['https://www.w3.org/1999/02/22-rdf-syntax-ns#', 'rdf:']
    ];
    for (const [base, prefix] of mappings) if (dt.startsWith(base)) return prefix + dt.substring(base.length);
    if (dt === NS.rdf.langString) return 'rdf:langString';
    return dt;
  };

  const asArray = val => (Array.isArray(val) ? val : [val]).filter(Boolean);
  const withoutNamedIndividual = types => asArray(types).filter(t => t !== NAMED_INDIVIDUAL);

  // --- Step 1: Build individual -> class map & class -> instances map ---
  const individualToClasses = new Map();
  const classToInstances = new Map();
  jsonld.forEach(node => {
    const types = withoutNamedIndividual(node['@type'] || []);
    if (asArray(node['@type']).includes(NAMED_INDIVIDUAL)) {
      individualToClasses.set(node['@id'], new Set(types));
      types.forEach(cls => {
        if (!classToInstances.has(cls)) classToInstances.set(cls, new Set());
        classToInstances.get(cls).add(node['@id']);
      });
    }
  });

  // --- Step 2: Gather class-level predicates ---
  const classPredicates = new Map();
  jsonld.forEach(node => {
    const types = asArray(node['@type']);
    if (!types.includes(NAMED_INDIVIDUAL)) {
      const classId = node['@id'];
      const props = Object.entries(node).filter(([k]) => k !== '@id' && k !== '@type');
      if (props.length > 0) classPredicates.set(classId, props);
    }
  });

  // --- Step 3: Infer properties from NamedIndividuals ---
  const inferredProps = new Map();
  jsonld.forEach(node => {
    if (!asArray(node['@type']).includes(NAMED_INDIVIDUAL)) return;
    const classTypes = withoutNamedIndividual(node['@type']);
    if (!classTypes.length) return;

    Object.entries(node).forEach(([predicate, object]) => {
      if (predicate === '@id' || predicate === '@type') return;

      classTypes.forEach(classId => {
        if (!inferredProps.has(classId)) inferredProps.set(classId, new Map());
        const propMap = inferredProps.get(classId);

        asArray(object).forEach(value => {
          if (!propMap.has(predicate)) propMap.set(predicate, new Set());

          let val = (value && typeof value === 'object') ? (value['@id'] ?? value['@value'] ?? value) : value;

          if (predicateToDatatype[predicate]) {
            propMap.get(predicate).add({ '@id': predicateToDatatype[predicate], '@type': DATATYPE_PROPERTY });
          } else if (value && typeof value === 'object' && (value['@type'] || value['@language'])) {
            const vTypes = asArray(value['@type']).map(normalizeDatatype).filter(Boolean);
            if (vTypes.length) {
              vTypes.forEach(dt => {
                if (dt.startsWith('xsd:') || dt.startsWith('rdf:')) propMap.get(predicate).add({ '@id': dt, '@type': DATATYPE_PROPERTY });
              });
            } else if (value['@language']) {
              propMap.get(predicate).add({ '@id': 'rdf:langString', '@type': DATATYPE_PROPERTY });
            }
          } else if (typeof val === 'string' && individualToClasses.has(val)) {
            individualToClasses.get(val).forEach(classIri => propMap.get(predicate).add({ '@id': classIri }));
          } else if (typeof val === 'string' && !individualToClasses.has(val)) {
            propMap.get(predicate).add({ '@id': val, '@type': NAMED_INDIVIDUAL });
          } else {
            propMap.get(predicate).add(val);
          }
        });
      });
    });
  });

  // --- Step 4: Propagate class-level predicates down to instances ---
  for (const [classId, props] of classPredicates.entries()) {
    const instances = classToInstances.get(classId) || new Set();
    props.forEach(([predicate, value]) => {
      instances.forEach(instId => {
        if (!inferredProps.has(classId)) inferredProps.set(classId, new Map());
        const propMap = inferredProps.get(classId);
        if (!propMap.has(predicate)) propMap.set(predicate, new Set());

        asArray(value).forEach(v => {
          if (typeof v === 'string' && classToInstances.has(v)) {
            classToInstances.get(v).forEach(instV => propMap.get(predicate).add({ '@id': instV, '@type': NAMED_INDIVIDUAL }));
          } else {
            propMap.get(predicate).add(v);
          }
        });
      });
    });
  }

  // --- Step 5: Convert Sets to arrays / single value ---
  const inferredPropsClean = new Map();
  for (const [classId, propMap] of inferredProps.entries()) {
    const propsObj = {};
    for (const [prop, vals] of propMap.entries()) {
      const arr = Array.from(vals);
      propsObj[prop] = arr.length === 1 ? arr[0] : arr;
    }
    inferredPropsClean.set(classId, propsObj);
    console.log(`Cleaned Inferred Props for Class: ${classId}`, propsObj);
  }

  return inferredPropsClean;
};

MyFunctions.mergePropsIntoClasses = (classMap, propMap, inferredProps = new Map()) => {
  /**
   * Merges explicit property definitions and inferred properties into
   * the given set of class definitions, ensuring that any referenced
   * classes (domains, ranges, or inferred '@id' values) are materialized
   * as top-level nodes and replacing nested entities with references.
   *
   * Deduplicates arrays once per property and preserves all values.
   *
   * Pure: does not mutate inputs; returns a new Array of class objects.
   */

  // --- Validation ---
  if (!(classMap instanceof Map)) {
    throw new TypeError(`mergePropsIntoClasses: classMap must be a Map.`);
  }
  if (!(propMap instanceof Map)) {
    throw new TypeError(`mergePropsIntoClasses: propMap must be a Map.`);
  }
  if (!(inferredProps instanceof Map)) {
    throw new TypeError(`mergePropsIntoClasses: inferredProps must be a Map.`);
  }

  // Work on a fresh Map to keep function pure
  const classes = new Map();

  // --- Deduplication Map ---
  const deduplicationMap = new Map(); // Tracks unique nodes by @id

  // Helper: Ensure a placeholder node exists for an IRI
  const ensurePlaceholderNode = (iri, type = "owl:Class") => {
    if (!iri || typeof iri !== 'string') return;
    if (deduplicationMap.has(iri)) {
      return deduplicationMap.get(iri);
    }
    const newNode = { "@id": iri, "@type": type };
    deduplicationMap.set(iri, newNode);
    classes.set(iri, newNode);
    return newNode;
  };

  // Helper: Flatten nested entities into top-level nodes
  const flattenEntity = (entity) => {
    if (entity && typeof entity === 'object' && entity['@id']) {
      const topLevelNode = ensurePlaceholderNode(entity['@id'], entity['@type'] || "owl:NamedIndividual");
      Object.entries(entity).forEach(([key, value]) => {
        if (key === '@id' || key === '@type') return;
        if (Array.isArray(value)) {
          topLevelNode[key] = value.map(v => flattenEntity(v));
        } else if (typeof value === 'object' && value['@id']) {
          topLevelNode[key] = flattenEntity(value);
        } else {
          topLevelNode[key] = value;
        }
      });
      return { "@id": entity['@id'] };
    }
    return entity;
  };

  // Helper: merge two values into deduplicated array or single value
  const mergeValues = (existing, incoming) => {
    const toArr = (v) => Array.isArray(v) ? v : (v !== undefined && v !== null ? [v] : []);
    const merged = [...toArr(existing), ...toArr(incoming)];
    const unique = Array.from(new Map(
      merged.map(item => {
        if (item && typeof item === 'object' && '@id' in item) {
          return [item['@id'], item];
        }
        return [JSON.stringify(item), item];
      })
    ).values());
    return unique.length === 1 ? unique[0] : unique;
  };

  // Track which properties were merged in Step 3
  const mergedPropsSet = new WeakMap();

  // Step 1: Clone existing class definitions
  for (const [classId, classDef] of classMap.entries()) {
    const deduplicatedNode = ensurePlaceholderNode(classId, "owl:Class");
    Object.assign(deduplicatedNode, classDef);
  }

  // Step 2: Add explicit property domain & range info and materialize ranges
  for (const prop of propMap.values()) {
    if (!prop.domain) continue;
    const domainIri = prop.domain;
    const rangeRaw = prop.range;
    const domainClass = ensurePlaceholderNode(domainIri, "owl:Class");
    if (typeof rangeRaw === 'string' && rangeRaw.length > 0) {
      ensurePlaceholderNode(rangeRaw, "owl:Class");
    }
    const propId = prop['@id'];
    domainClass[propId] = (typeof rangeRaw === 'string' && rangeRaw.length > 0)
      ? { "@id": rangeRaw }
      : null;
  }

  // Step 3: Merge inferredProps into classes
  for (const [classId, props] of inferredProps.entries()) {
    const domainClass = ensurePlaceholderNode(classId, "owl:Class");
    for (const [propIri, val] of Object.entries(props)) {
      let incoming;
      if (Array.isArray(val)) {
        incoming = val.map(v => flattenEntity(v));
      } else if (typeof val === 'object' && val['@id']) {
        incoming = flattenEntity(val);
      } else {
        incoming = val;
      }
      domainClass[propIri] = mergeValues(domainClass[propIri], incoming);
      if (!mergedPropsSet.has(domainClass)) {
        mergedPropsSet.set(domainClass, new Set());
      }
      mergedPropsSet.get(domainClass).add(propIri);
    }
  }

  // Step 4: Deduplicate Arrays in Top-Level Nodes (skip already merged props)
  for (const node of classes.values()) {
    const mergedProps = mergedPropsSet.get(node) || new Set();
    Object.entries(node).forEach(([key, value]) => {
      if (Array.isArray(value) && !mergedProps.has(key)) {
        node[key] = Array.from(new Set(
          value.map(v => (v && typeof v === 'object' && v['@id']) ? v['@id'] : v)
        )).map(id => (typeof id === 'string' ? { "@id": id } : id));
      }
    });
  }

  // Step 5: Return array of distinct top-level nodes
  const result = Array.from(classes.values());
  console.log("Final Merged Classes:", result);
  return result;
};

MyFunctions.extractTriples = (jsonld) => {
  /**
   * Extracts RDF triples from a JSON-LD node array.
   *
   * - Keeps `object` as a string (IRI or lexical literal) for compatibility.
   * - Adds optional metadata for literals:
   *     - objectTermType: 'literal' | 'IRI'
   *     - objectLanguage: e.g., 'en' (if @language present)
   *     - objectDatatype: e.g., 'rdf:langString', 'xsd:string', 'xsd:integer', etc.
   *
   * @param {Array<Object>} jsonld
   * @returns {Array<{subject: string, predicate: string, object: string,
   *                  objectTermType?: 'literal'|'IRI',
   *                  objectLanguage?: string|null,
   *                  objectDatatype?: string|null}>}
   */

  if (!Array.isArray(jsonld)) {
    throw new TypeError("Expected 'jsonld' to be an array of node objects.");
  }

  const asArray = (v) => (Array.isArray(v) ? v : [v]);
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

  const triples = jsonld.flatMap((node) => {
    const subject = node['@id'];
    const out = [];

    const addTriple = (predicate, value) => {
      // Object node (IRI or literal object)
      if (isObj(value)) {
        if ('@id' in value) {
          // IRI object
          out.push({
            subject,
            predicate,
            object: value['@id'],
            objectTermType: 'IRI'
          });
          return;
        }
        if ('@value' in value) {
          // Literal object with optional @language and/or @type
          const lex = value['@value'];
          const lang = value['@language'] ?? null;
          // If language present, treat as rdf:langString unless a specific type is provided
          const dtype = value['@type'] ?? (lang ? 'rdf:langString' : null);

          out.push({
            subject,
            predicate,
            object: String(lex),       // keep as string for downstream compatibility
            objectTermType: 'literal',
            objectLanguage: lang,
            objectDatatype: dtype
          });
          return;
        }
        // Fallback: unknown object shape -> stringify as literal
        out.push({
          subject,
          predicate,
          object: JSON.stringify(value),
          objectTermType: 'literal',
          objectDatatype: null
        });
        return;
      }

      // Primitive literal (string/number/boolean)
      let dtype = null;
      if (typeof value === 'number') {
        dtype = Number.isInteger(value) ? 'xsd:integer' : 'xsd:decimal';
      } else if (typeof value === 'boolean') {
        dtype = 'xsd:boolean';
      }
      out.push({
        subject,
        predicate,
        object: String(value),
        objectTermType: 'literal',
        objectDatatype: dtype
      });
    };

    // Regular properties (skip @id/@type here)
    for (const [predicate, obj] of Object.entries(node)) {
      if (predicate === '@id' || predicate === '@type') continue;
      asArray(obj).forEach(item => addTriple(predicate, item));
    }

    // Types
    const types = node['@type'];
    if (types) {
      asArray(types).forEach(type =>
        out.push({
          subject,
          predicate: '@type',
          object: type,
          objectTermType: 'IRI'
        })
      );
    }

    return out;
  });

  // Optional: console for debugging
  console.log("Extracted Triples:", triples);
  return triples;
};

MyFunctions.createTriple = (subject, predicate, object) => {
  /**
 * Creates a normalized RDF triple from subject, predicate, and object values.
 *
 * - If `object` is an object with `@id`, extracts its IRI.
 * - If `object` is an object with `@value`, extracts its literal value.
 * - Otherwise, uses the object value as-is.
 *
 * This function is **pure**: it does not mutate inputs and always returns a new triple object.
 *
 * @param {string} subject - The subject IRI of the triple.
 * @param {string} predicate - The predicate IRI or keyword of the triple.
 * @param {string|object} object - The object value, which can be:
 *   - A string IRI or literal
 *   - An object with `@id` for IRI values
 *   - An object with `@value` for literal values
 *
 * @returns {{ subject: string, predicate: string, object: string }}
 *          A normalized triple with string `object` value.
 *
 * @throws {TypeError} If `subject` or `predicate` is not a string.
 * @throws {TypeError} If `object` is neither a string, an object, nor undefined/null.
 */

  // Validate subject
  if (typeof subject !== "string") {
    throw new TypeError(`Expected subject to be a string, got ${typeof subject}`);
  }

  // Validate predicate
  if (typeof predicate !== "string") {
    throw new TypeError(`Expected predicate to be a string, got ${typeof predicate}`);
  }

  // Validate object type
  if (
    object !== null &&
    object !== undefined &&
    typeof object !== "string" &&
    typeof object !== "object"
  ) {
    throw new TypeError(`Expected object to be string, object, null, or undefined, got ${typeof object}`);
  }

  // Normalize object value
  if (object && typeof object === "object") {
    if ("@id" in object) {
      return { subject, predicate, object: object["@id"] };
    }
    if ("@value" in object) {
      return { subject, predicate, object: object["@value"] };
    }
  }

  // Use value directly (covers strings, null, undefined)
  return { subject, predicate, object };
};

MyFunctions.getClassMap = (triples) => {
  /**
 * Builds a map of OWL classes and their subclass relationships
 * from a given list of RDF triples.
 *
 * The function:
 * - Detects all `owl:Class` declarations via `@type` predicate.
 * - Adds `rdfs:subClassOf` relations, creating placeholder class
 *   entries for undeclared classes where necessary.
 * - Ensures the returned structure is a Map keyed by class IRI,
 *   each value being a plain object describing that class.
 *
 * @param {Array<{subject: string, predicate: string, object: string}>} triples
 *   An array of RDF triples in object form, where each triple contains:
 *   - `subject`: The IRI of the subject.
 *   - `predicate`: The IRI or keyword of the predicate (e.g., "@type").
 *   - `object`: The IRI or literal value of the object.
 *
 * @returns {Map<string, Object>} A Map where:
 *   - Keys are class IRIs (strings).
 *   - Values are plain objects with at least `@id` and `@type` keys,
 *     and possibly an `rdfs:subClassOf` key.
 *
 * @throws {TypeError} If `triples` is not an array of valid triple objects.
 */
  if (!Array.isArray(triples)) {
    throw new TypeError("Expected 'triples' to be an array.");
  }
  triples.forEach((triple, i) => {
    if (
      !triple ||
      typeof triple !== "object" ||
      typeof triple.subject !== "string" ||
      typeof triple.predicate !== "string" ||
      typeof triple.object !== "string"
    ) {
      throw new TypeError(`Invalid triple at index ${i}: expected {subject, predicate, object} as strings.`);
    }
  });

  // --- Core logic ---
  const classMap = new Map();

  // Step 1: Register all explicitly declared owl:Class instances
  triples.forEach(({ subject, predicate, object }) => {
    if (predicate === "@type" && object === NS.owl.Class) {
      if (!classMap.has(subject)) {
        classMap.set(subject, { "@id": subject, "@type": "owl:Class" });
      }
    }
  });

  // Step 2: Process subclass relationships
  triples.forEach(({ subject, predicate, object }) => {
    if (predicate === NS.rdfs.subClassOf) {
      // If subclass already exists, just add subClassOf
      if (classMap.has(subject)) {
        classMap.get(subject)["rdfs:subClassOf"] = { "@id": object };
      } else {
        // Create placeholder subclass entry
        classMap.set(subject, {
          "@id": subject,
          "@type": "owl:Class",
          "rdfs:subClassOf": { "@id": object }
        });
      }
      // Ensure superclass exists
      if (!classMap.has(object)) {
        classMap.set(object, { "@id": object, "@type": "owl:Class" });
      }
    }
  });

  return classMap;
};


MyFunctions.getProperties = (triples) => {
  /**
 * Builds a property map from RDF triples.
 *
 * - Finds all properties declared as `owl:ObjectProperty` or `owl:DatatypeProperty`.
 * - Collects their types, domain, and range.
 * - Returns a Map keyed by property IRI.
 *
 * @param {Array<{subject: string, predicate: string, object: string}>} triples
 *        An array of RDF triples in `{subject, predicate, object}` format.
 *
 * @returns {Map<string, { '@id': string, types: string[], domain: string|null, range: string|null }>}
 *          Map where keys are property IRIs and values are property metadata.
 */

  if (!Array.isArray(triples)) {
    throw new TypeError("Expected 'triples' to be an array of {subject, predicate, object}.");
  }

  const OWL_OBJECT_PROPERTY = NS.owl.ObjectProperty;
  const OWL_DATATYPE_PROPERTY = NS.owl.DatatypeProperty;
  const RDFS_DOMAIN = NS.rdfs.domain;
  const RDFS_RANGE = NS.rdfs.range;

  const propMap = new Map();

  // Step 1: Identify properties and initialize entries
  triples.forEach(({ subject, predicate, object }) => {
    if (
      predicate === "@type" &&
      (object === OWL_OBJECT_PROPERTY || object === OWL_DATATYPE_PROPERTY)
    ) {
      if (!propMap.has(subject)) {
        propMap.set(subject, { "@id": subject, types: [object], domain: null, range: null });
      } else if (!propMap.get(subject).types.includes(object)) {
        propMap.get(subject).types.push(object);
      }
    }
  });

  // Step 2: Populate domain and range
  triples.forEach(({ subject, predicate, object }) => {
    if (!propMap.has(subject)) return;

    if (predicate === RDFS_DOMAIN) {
      propMap.get(subject).domain = object;
    } else if (predicate === RDFS_RANGE) {
      propMap.get(subject).range = object;
    }
  });

  return propMap;
};

MyFunctions.extractLocalNameFromIRI = (iri) => {
  /**
 * Extracts the local name (compact term) from a given IRI or CURIE.
 * Handles full IRIs with "/" or "#" as well as CURIEs like "ex:Person".
 *
 * @param {string} iri - The IRI or CURIE to extract the local name from.
 * @returns {string} - The extracted local name.
 * @throws {TypeError} - If the input is not a valid non-empty string.
 * @throws {Error} - If the local name cannot be extracted from the IRI.
 */
  // Validate input is a non-empty string
  if (typeof iri !== "string" || !iri.trim()) {
    throw new TypeError("Input must be a non-empty string.");
  }

  // Handle CURIEs like "ex:Person"
  if (iri.includes(":") && !iri.startsWith("http")) {
    const [_, local] = iri.split(":");
    return local || iri; // Fallback to the full IRI if no local part
  }

  // Handle full IRIs with "/" or "#"
  const parts = iri.split(/[\/#]/); // Split by "/" or "#"
  const localName = parts.pop(); // Get the last part
  if (!localName) {
    throw new Error(`Could not extract local name from IRI: '${iri}'`);
  }

  return localName;
};




MyFunctions.getFormalLabel = (jsonld, id, language) => {
/**
 * Retrieves the formal label for a given entity in a JSON-LD dataset.
 * Searches for labels using predefined keys and optionally filters by language.
 *
 * @param {Array<Object>} jsonld - The JSON-LD dataset as an array of entities.
 * @param {string} id - The `@id` of the entity whose label is to be retrieved.
 * @param {string} [language] - Optional language code to filter the label (e.g., "en"). If omitted, blank (`""`), or `null`, no filtering is applied.
 * @returns {string|null} - The formal label if found, otherwise `null`.
 * @throws {TypeError} - If inputs are not of the expected types.
 */
  // Validate inputs
  if (!Array.isArray(jsonld)) {
    throw new TypeError("The 'jsonld' parameter must be an array of entities.");
  }
  if (typeof id !== "string" || !id.trim()) {
    throw new TypeError("The 'id' parameter must be a non-empty string.");
  }
  if (language !== undefined && language !== null && typeof language !== "string") {
    throw new TypeError("The 'language' parameter must be a string if provided.");
  }

  // Normalize empty string (`""`) to `null` to treat it as "no language filter"
  const filterLanguage = language && language.trim() ? language : null;

  // Predefined keys to search for labels
  const labelKeys = [
    NS.rdfs.label, // Full IRI
    "rdfs:label",                                // Prefixed IRI
    "label"                                      // Generic key
  ];

  // Find the entity with the matching @id
  const entity = jsonld.find(e => e["@id"] === id);
  if (!entity) return null;

  // Iterate over label keys to find a matching label
  for (const key of labelKeys) {
    const labels = Array.isArray(entity[key]) ? entity[key] : [entity[key]]; // Normalize to array
    for (const label of labels) {
      // Ensure the label object exists before accessing its properties
      if (label && label["@value"]) {
        // If language filtering is enabled, check for a match; otherwise, return the first `@value`
        if (!filterLanguage || label["@language"] === filterLanguage) {
          return label["@value"];
        }
      }
    }
  }

  // Return null if no label is found
  return null;
};


MyFunctions.getLiteralLabel = (entity, language) => {
/**
 * Extracts the first literal value from an entity's properties. If a language is provided, it filters by language; otherwise, it returns the first available `@value`.
 *
 * @param {Object} entity - The JSON-LD entity object to search for literal values.
 * @param {string} [language] - Optional language code to filter the literal value (e.g., "en"). If omitted, blank (`""`), or `null`, no filtering is applied.
 * @returns {string|null} - The first matching literal value if found, otherwise `null`.
 * @throws {TypeError} - If inputs are not of the expected types.
 */
  // Validate inputs
  if (typeof entity !== "object" || entity === null || Array.isArray(entity)) {
    throw new TypeError("The 'entity' parameter must be a non-null object.");
  }
  if (language !== undefined && language !== null && typeof language !== "string") {
    throw new TypeError("The 'language' parameter must be a string if provided.");
  }

  // Normalize empty string (`""`) to `null` to treat it as "no language filter"
  const filterLanguage = language && language.trim() ? language : null;

  // Iterate over the entity's keys
  for (const key in entity) {
    if (entity.hasOwnProperty(key)) {
      // Normalize property values to an array
      const values = Array.isArray(entity[key]) ? entity[key] : [entity[key]];

      // Search for a matching literal value
      for (const value of values) {
        if (value["@value"]) {
          // If language filtering is enabled, check for a match; otherwise, return the first `@value`
          if (!filterLanguage || value["@language"] === filterLanguage) {
            return value["@value"];
          }
        }
      }
    }
  }
  // Return null if no matching literal value is found
  return null;
};

MyFunctions.getLabelFromNamedIndividual = (jsonld, id, language) => {
/**
 * Constructs a label for a `NamedIndividual` in a JSON-LD dataset. If the entity is of type `NamedIndividual`,
 * it combines the type's label (or local name if no label exists) with a shortened version of the entity's local ID.
 *
 * @param {Array<Object>} jsonld - The JSON-LD dataset as an array of entities.
 * @param {string} id - The `@id` of the entity to retrieve the label for.
 * @param {string} [language] - Optional language code to filter the type's label (e.g., "en"). If omitted, blank (`""`), or `null`, no filtering is applied.
 * @returns {string|null} - The constructed label if the entity is a `NamedIndividual`, otherwise `null`.
 * @throws {TypeError} - If inputs are not of the expected types.
 */
  // Validate inputs
  if (!Array.isArray(jsonld)) {
    throw new TypeError("The 'jsonld' parameter must be an array of entities.");
  }
  if (typeof id !== "string" || !id.trim()) {
    throw new TypeError("The 'id' parameter must be a non-empty string.");
  }
  if (language !== undefined && language !== null && typeof language !== "string") {
    throw new TypeError("The 'language' parameter must be a string if provided.");
  }

  // Find the entity with the matching @id
  const entity = jsonld.find(e => e["@id"] === id);
  if (!entity) return null;

  // Get the @type property and normalize it to an array
  const types = Array.isArray(entity["@type"]) ? entity["@type"] : [entity["@type"]];

  // Check if the entity is a NamedIndividual
  if (!types.includes(NS.owl.NamedIndividual)) return null;

  // Iterate over the types to find a label for the type
  for (const typeIRI of types) {
    // Skip the NamedIndividual type itself
    if (typeIRI === NS.owl.NamedIndividual) continue;

    // Attempt to get the label for the type
    const typeLabel =
      MyFunctions.getFormalLabel(jsonld, typeIRI, language) || // Try to get label in the specified language
      MyFunctions.getFormalLabel(jsonld, typeIRI) ||           // Fallback to the first available label
      MyFunctions.extractLocalNameFromIRI(typeIRI);            // Fallback to the local name of the type IRI

    if (typeLabel) {
      // Extract the local name from the entity's ID
      const localId = MyFunctions.extractLocalNameFromIRI(id);

      // Shorten the local name to a maximum of 5 characters
      const namePart = localId.length > 5 ? localId.substring(0, 5) : localId;

      // Construct and return the label
      return `${typeLabel} ${namePart}`;
    }
  }

  // Return null if no label could be constructed
  return null;
};


MyFunctions.getPreferredLabel = (jsonld, id, language) => {
/**
 * Retrieves the preferred label for a given entity in a JSON-LD dataset.
 * Attempts to get a formal label, a literal label, or a label for a NamedIndividual.
 * Falls back to the first available label if the requested language is not found.
 * Finally, falls back to the local name of the entity's IRI if no label is found.
 *
 * @param {Array<Object>} jsonld - The JSON-LD dataset as an array of entities.
 * @param {string} id - The `@id` of the entity whose label is to be retrieved.
 * @param {string} [language] - Optional language code to filter labels (e.g., "en"). If omitted, blank (`""`), or `null`, no filtering is applied.
 * @returns {string} - The preferred label for the entity, or the local name of its IRI as a fallback.
 * @throws {TypeError} - If inputs are not of the expected types.
 */
  // Validate inputs
  if (!Array.isArray(jsonld)) {
    throw new TypeError("The 'jsonld' parameter must be an array of entities.");
  }
  if (typeof id !== "string" || !id.trim()) {
    throw new TypeError("The 'id' parameter must be a non-empty string.");
  }
  if (language !== undefined && language !== null && typeof language !== "string") {
    throw new TypeError("The 'language' parameter must be a string if provided.");
  }

  // Step 1: Try to get a formal label
  const formalLabel = MyFunctions.getFormalLabel(jsonld, id, language) || MyFunctions.getFormalLabel(jsonld, id);
  if (formalLabel) return formalLabel;

  // Step 2: Try to get a literal label
  const entity = jsonld.find(e => e["@id"] === id);
  if (entity) {
    const literalLabel = MyFunctions.getLiteralLabel(entity, language) || MyFunctions.getLiteralLabel(entity);
    if (literalLabel) return literalLabel;
  }

  // Step 3: Try to get a label for NamedIndividual
  const namedIndividualLabel = MyFunctions.getLabelFromNamedIndividual(jsonld, id, language);
  if (namedIndividualLabel) return namedIndividualLabel;

  // Step 4: Fallback to the local name of the IRI
  return MyFunctions.extractLocalNameFromIRI(id);
};

window.MyFunctions.eliminateRedundantLinkAssertions = (links) => {
  /**
   * Removes duplicate link objects from an array, preserving the first occurrence.
   * Uses the pure `linkAssertionEquivalenceCheck` function to determine equality.
   *
   * @param {Array<Object>} links - Array of link objects to deduplicate.
   * @returns {Array<Object>} - New array with duplicates removed.
   * @throws {TypeError} - If `links` is not an array.
   * @throws {Error} - If `linkAssertionEquivalenceCheck` is not defined.
   */

  if (!Array.isArray(links)) {
    // Instead of throwing, return empty array or you can still throw based on your preference
    // return [];
    throw new TypeError("eliminateRedundantLinkAssertions expects an array of link objects.");
  }

  if (typeof window.MyFunctions.linkAssertionEquivalenceCheck !== "function") {
    throw new Error("eliminateRedundantLinkAssertions requires 'linkAssertionEquivalenceCheck' function to be defined.");
  }

  return links.filter((link, index, self) =>
    window.MyFunctions.linkAssertionEquivalenceCheck(link, self[index]) // <-- fix: swapped args
      ? index === self.findIndex(l => window.MyFunctions.linkAssertionEquivalenceCheck(l, link))
      : false
  );
};


window.MyFunctions.restrictLinksToExistingEntities = (links, validNodeIds) => {
  /**
   * Filters links to include only those whose source and target are in the validNodeIds set.
   * @param {Array} links - Array of link objects.
   * @param {Set<string>|Object|Array} validNodeIds - Set, object, or array of node IDs.
   * @returns {Array} - Filtered links.
   */
  if (!Array.isArray(links)) {
    throw new TypeError("restrictLinksToExistingEntities: links must be an array.");
  }

  if (!(validNodeIds instanceof Set)) {
    if (Array.isArray(validNodeIds)) {
      validNodeIds = new Set(validNodeIds);
    } else if (typeof validNodeIds === "object" && validNodeIds !== null) {
      validNodeIds = new Set(Object.keys(validNodeIds));
    } else {
      throw new TypeError("restrictLinksToExistingEntities: validNodeIds must be a Set, array, or object with keys.");
    }
  }

  return links.filter(link =>
    validNodeIds.has(link.source) && validNodeIds.has(link.target)
  );
};

window.MyFunctions.extractLocalNameFromIRI_Batch = (iris) => {
  /**
 * Extracts local names (compact terms) from an array of IRIs or CURIEs.
 * Handles full IRIs with "/" or "#" as well as CURIEs like "ex:Person".
 *
 * @param {string[]} iris - Array of full IRIs or CURIEs.
 * @returns {string[]} - Array of extracted local names.
 * @throws {TypeError} - If input is not an array of non-empty strings.
 */
  // âœ… Validate input is an array
  if (!Array.isArray(iris)) {
    throw new TypeError("extractLocalNameFromIRI_Batch expects an array of strings.");
  }

  // âœ… Validate each item is a non-empty string
  iris.forEach((iri, idx) => {
    if (typeof iri !== "string" || !iri.trim()) {
      throw new TypeError(`Item at index ${idx} is not a valid non-empty string.`);
    }
  });

  // âœ… Extract local names
  return iris.map(iri => {
    // Handle CURIEs like ex:Person
    if (iri.includes(":") && !iri.startsWith("http")) {
      const [prefix, local] = iri.split(":");
      return local || prefix; // Fallback to prefix if no local part
    }

    // Handle IRIs with / or #
    const parts = iri.split(/[\/#]/);
    const local = parts.pop();
    if (!local) {
      throw new Error(`Could not extract local name from IRI: '${iri}'`);
    }
    return local;
  });
};
window.MyFunctions.linkAssertionEquivalenceCheck = (a, b) => {
  /**
   * Compares two link objects to determine if they have identical `source`, `target`, and `label` properties.
   *
   * @param {Object} a - First link object with `source`, `target`, and `label` keys.
   * @param {Object} b - Second link object with `source`, `target`, and `label` keys.
   * @returns {boolean} - True if both links are equivalent, false otherwise.
   * @throws {TypeError} - If either input is not an object or missing required keys.
   */

  // âœ… Validate input types
  if (typeof a !== "object" || a === null) {
    throw new TypeError("linkAssertionEquivalenceCheck: First argument must be a non-null object.");
  }
  if (typeof b !== "object" || b === null) {
    throw new TypeError("linkAssertionEquivalenceCheck: Second argument must be a non-null object.");
  }

  // âœ… Ensure required keys are present in both objects
  const requiredKeys = ["source", "target", "label"];
  for (const key of requiredKeys) {
    if (!(key in a)) {
      throw new Error(`linkAssertionEquivalenceCheck: First object is missing key '${key}'.`);
    }
    if (!(key in b)) {
      throw new Error(`linkAssertionEquivalenceCheck: Second object is missing key '${key}'.`);
    }
  }

  // âœ… Compare values of the relevant keys
  return a.source === b.source && a.target === b.target && a.label === b.label;
};

window.MyFunctions.getPreferredLabelForEntity = (jsonld, id, language) => {
  if (!Array.isArray(jsonld)) {
    throw new TypeError("getPreferredLabelForEntity expects jsonld to be an array.");
  }
  if (typeof id !== "string") {
    throw new TypeError("getPreferredLabelForEntity expects id to be a string.");
  }
  if (language !== undefined && typeof language !== "string") {
    throw new TypeError("getPreferredLabelForEntity expects language to be a string if provided.");
  }

  const labelKeys = [
    NS.rdfs.label,
    "rdfs:label",
    "label"
  ];

  const entity = jsonld.find(e => e["@id"] === id);

  // ðŸ§ª 1. Try direct label
  if (entity) {
    for (const key of labelKeys) {
      let labels = entity[key];
      if (!labels) continue;

      if (!Array.isArray(labels)) labels = [labels];

      if (language) {
        const match = labels.find(l => l["@language"] === language);
        if (match) return match["@value"];
      }

      if (labels.length > 0 && labels[0]["@value"]) {
        return labels[0]["@value"];
      }
    }

    // ðŸ§ª 2. If type includes meaningful class, use its label as a prefix
    const types = entity["@type"] || [];
    const typeIRIs = Array.isArray(types) ? types : [types];
    const skipTypes = new Set(["Class", "ObjectProperty", "Restriction", "Unknown", "NamedIndividual"]);

    for (const typeIRI of typeIRIs) {
      const [localTypeName] = window.MyFunctions.extractLocalNameFromIRI_Batch([typeIRI]);
      if (skipTypes.has(localTypeName)) continue;

      const typeLabel =
        window.MyFunctions.getPreferredLabelForEntity(jsonld, typeIRI, "en") ||
        window.MyFunctions.getPreferredLabelForEntity(jsonld, typeIRI);

      if (typeLabel) {
        const [localId] = window.MyFunctions.extractLocalNameFromIRI_Batch([id]);
        const namePart = localId.length > 5 ? localId.substring(0, 5) : localId;
        return `${typeLabel} ${namePart}`;
      }
    }
  }

  // ðŸ§ª 3. Final fallback to local name from IRI
  return window.MyFunctions.extractLocalNameFromIRI_Batch([id])[0] || id;
};


window.MyFunctions.constructGraphNodeRepresentation = (id, properties, jsonld) => {

  /**
 * Builds a normalized node object from an ID and a list of property entries.
 * If no label is found, and the type includes "NamedIndividual", the name is derived
 * using extractLocalNameFromType(). Otherwise, it uses extractLocalNameFromIRI_Batch([id]).
 *
 * @param {string} id - The full IRI of the node.
 * @param {Array<Object>} properties - Array of property objects with keys: property, value.
 * @returns {Object} - Object with `id`, `name`, `type`, and `properties`.
 *
 * @throws {TypeError} - If inputs are of incorrect types.
 * @throws {Error} - If extractLocalNameFromIRI_Batch or extractLocalNameFromType fails.
 */
  if (typeof id !== "string") {
    throw new TypeError("constructGraphNodeRepresentation expects id to be a string.");
  }

  if (!Array.isArray(properties)) {
    throw new TypeError("constructGraphNodeRepresentation expects properties to be an array.");
  }

  let name;
  try {
    name = window.MyFunctions.getPreferredLabelForEntity(jsonld, id, "en");
    if (!name) {
      // fallback to local name if nothing found
      name = window.MyFunctions.extractLocalNameFromIRI_Batch([id])[0];
    }
  } catch (err) {
    throw new Error(`constructGraphNodeRepresentation: Failed to derive name: ${err.message}`);
  }
  return {
  id,
  name,
  type: properties
    .filter(p => p.property === "type")
    .map(p => {
      const local = window.MyFunctions.extractLocalNameFromIRI_Batch([p.value])[0];
      return local || p.value; // fallback to full IRI if local name fails
    }),
  properties
};

};

window.MyFunctions.recursivelyTraceEntityRelations = (
  jsonld,
  id,
  state,
  maxDepth = Infinity,
  depth = 0,
  debug = false
) => {
  /**
   * Recursively traverses a JSON-LD graph from a given node `@id`, exploring outbound and inbound links,
   * up to a maximum depth. Avoids cycles using a `seen` set and builds a state of nodes and links.
   */

  if (typeof id !== "string" || id.trim().length === 0) {
    throw new TypeError(`id must be a non-empty string. Received: ${JSON.stringify(id)}`);
  }

  if (typeof maxDepth === "string") {
    if (maxDepth.toLowerCase() === "infinity") {
      maxDepth = Infinity;
    } else {
      const parsed = parseInt(maxDepth, 10);
      maxDepth = isNaN(parsed) ? Infinity : parsed;
    }
  }

  console.log("recursivelyTraceEntityRelations() CALLED WITH:", {
    id,
    typeOfId: typeof id,
    isString: typeof id === "string",
    isNaN: typeof id === "number" ? isNaN(id) : "n/a"
  });

  if (!Array.isArray(jsonld)) throw new TypeError("jsonld must be an array.");
  if (typeof id !== "string") throw new TypeError("id must be a string.");
  if (typeof maxDepth !== "number" || maxDepth < 0) throw new TypeError("maxDepth must be a non-negative number.");
  if (!state || typeof state !== "object" || !state.nodes || !state.links) {
    throw new TypeError("state must be an object with nodes and links.");
  }

  // normalize seen into Set
  if (!(state.seen instanceof Set)) {
    state.seen = new Set(Array.isArray(state.seen) ? state.seen : Object.keys(state.seen || {}));
  }

  if (!state.debugInfo) {
    state.debugInfo = {};
  }
  if (!state.debugInfo[depth]) {
    state.debugInfo[depth] = { nodes: 0, links: 0 };
  }

  if (depth > maxDepth || state.seen.has(id)) return state;

  const entity = jsonld.find(e => e["@id"] === id);
  if (!entity) {
    if (debug) console.warn(`âš ï¸ No entity found for ID: ${id}`);
    return state; // Skip missing references, don't throw
  }

  if (!state.nodes[id]) {
    try {
      const props = window.MyFunctions.deriveRepresentationalAttributes(jsonld, id);
      state.nodes[id] = window.MyFunctions.constructGraphNodeRepresentation(id, props, jsonld);
      state.debugInfo[depth].nodes += 1;
    } catch (err) {
      if (debug) console.warn(`âŒ Failed to build node for ${id}: ${err.message}`);
    }
  }

  const newSeen = new Set(state.seen).add(id);
  let currentState = {
    nodes: { ...state.nodes },
    links: [...state.links],
    seen: newSeen,
    debugInfo: state.debugInfo
  };

  if (debug) console.log(`ðŸ” Visiting ${id} at depth ${depth}`);

  // Traverse outbound links
  for (const [predicate, values] of Object.entries(entity)) {
    if (predicate.startsWith("@")) continue;

    const valArray = Array.isArray(values) ? values : [values];
    for (const val of valArray) {
      if (val && typeof val === "object" && "@id" in val) {
        const targetId = val["@id"];
        const label =
          window.MyFunctions.getPreferredLabelForEntity(jsonld, predicate, "en") ||
          window.MyFunctions.getPreferredLabelForEntity(jsonld, predicate);
        const link = { source: id, target: targetId, label };

        if (!currentState.links.some(l => window.MyFunctions.linkAssertionEquivalenceCheck(l, link))) {
          currentState.links.push(link);
          currentState.debugInfo[depth].links += 1;
          currentState = window.MyFunctions.recursivelyTraceEntityRelations(
            jsonld,
            targetId,
            currentState,
            maxDepth,
            depth + 1,
            debug
          );
        }
      }
    }
  }

  // Traverse inbound links
  for (const node of jsonld) {
    for (const [predicate, values] of Object.entries(node)) {
      if (predicate.startsWith("@")) continue;

      const valArray = Array.isArray(values) ? values : [values];
      for (const val of valArray) {
        if (val && typeof val === "object" && "@id" in val && val["@id"] === id) {
          const sourceId = node["@id"];
          if (!sourceId) continue;

          const label =
            window.MyFunctions.getPreferredLabelForEntity(jsonld, predicate, "en") ||
            window.MyFunctions.getPreferredLabelForEntity(jsonld, predicate);
          const link = { source: sourceId, target: id, label };

          if (!currentState.links.some(l => window.MyFunctions.linkAssertionEquivalenceCheck(l, link))) {
            currentState.links.push(link);
            currentState.debugInfo[depth].links += 1;
            currentState = window.MyFunctions.recursivelyTraceEntityRelations(
              jsonld,
              sourceId,
              currentState,
              maxDepth,
              depth + 1,
              debug
            );
          }
        }
      }
    }
  }

  return currentState;
};


window.MyFunctions.deriveRepresentationalAttributes = (jsonld, iri) => {
  /**
 * Extracts human-readable property/value pairs from a JSON-LD entity identified by an IRI.
 * Special handling for `@id` as "iri" and `@type` as "type" using label resolution.
 *
 * @param {Array<Object>} jsonld - JSON-LD graph (array of nodes).
 * @param {string} iri - IRI of the entity within the JSON-LD graph.
 * @returns {Array<Object>} Array of objects with keys: property, value (string), (optional) language.
 * @throws {TypeError} If inputs are not valid.
 * @throws {Error} If a label resolution function fails.
 */
  // âœ… Input validation
  if (!Array.isArray(jsonld)) {
    throw new TypeError("Expected jsonld to be an array.");
  }
  if (typeof iri !== "string") {
    throw new TypeError("Expected iri to be a string.");
  }

  // Find the entity in the JSON-LD graph
  const entity = jsonld.find(node => node["@id"] === iri);
  if (!entity) {
    throw new Error(`Entity with IRI ${iri} not found in the JSON-LD graph.`);
  }

  const props = [];

  // âœ… Handle @id as 'iri'
  props.push({ property: "iri", value: entity["@id"] });

  // âœ… Handle @type as 'type', retain full IRI
  if (entity["@type"]) {
    const types = Array.isArray(entity["@type"]) ? entity["@type"] : [entity["@type"]];
    types.forEach(t => {
      props.push({ property: "type", value: t });
    });
  }

  // âœ… Process all other keys (skip JSON-LD reserved)
  for (const [predicate, values] of Object.entries(entity)) {
    if (predicate.startsWith("@")) continue;

    const valArray = Array.isArray(values) ? values : [values];

    // âœ… Resolve label for predicate with fallback
    let label;
    try {
      label =
        window.MyFunctions.getPreferredLabelForEntity(jsonld, predicate, "en") ||
        window.MyFunctions.getPreferredLabelForEntity(jsonld, predicate);
      if (!label) {
        const fallback = window.MyFunctions.extractLocalNameFromIRI_Batch([predicate]);
        label = Array.isArray(fallback) ? fallback[0] : fallback;
      }
    } catch {
      const fallback = window.MyFunctions.extractLocalNameFromIRI_Batch([predicate]);
      label = Array.isArray(fallback) ? fallback[0] : fallback;
    }

    for (const val of valArray) {
      if (typeof val === "object" && val !== null && "@value" in val) {
        const out = { property: label, value: val["@value"] };
        if (val["@language"]) out.language = val["@language"];
        props.push(out);
      }
    }
  }

  return props;
};


window.MyFunctions.generateEntityGraphFromRDFRepresentation = (jsonld, targetId = null, maxDepth = Infinity) => {
  /**
   * Converts a JSON-LD dataset into a graph format, starting from a target node,
   * or fully traversing the graph if no targetId is provided.
   *
   * @param {Array<Object>} jsonld - The JSON-LD graph as an array of entities.
   * @param {string|null} targetId - The starting entity's @id to traverse from, or null to traverse all.
   * @param {number|string} [maxDepth=Infinity] - Maximum depth; accepts number or 'infinity'.
   * @returns {{ nodes: Array<Object>, links: Array<Object> }} - Graph object with nodes and links.
   * @throws {TypeError} - If arguments are of incorrect type.
   */

  console.log("generateEntityGraphFromRDFRepresentation() called with:", {
    targetId,
    maxDepth,
    typeOfMaxDepth: typeof maxDepth
  });

  // Validate jsonld
  if (!Array.isArray(jsonld)) {
    throw new TypeError("generateEntityGraphFromRDFRepresentation expects jsonld to be an array.");
  }

  // Normalize and validate maxDepth
  if (typeof maxDepth === "string") {
    if (maxDepth.toLowerCase() === "infinity") {
      maxDepth = Infinity;
    } else {
      const parsed = parseInt(maxDepth, 10);
      maxDepth = isNaN(parsed) ? Infinity : parsed;
    }
  }
  if (typeof maxDepth !== "number" || isNaN(maxDepth) || maxDepth < 0) {
    throw new TypeError("generateEntityGraphFromRDFRepresentation: maxDepth must be a non-negative number or Infinity.");
  }

  // Validate targetId if provided
  if (targetId !== null && typeof targetId !== "string") {
    throw new TypeError("generateEntityGraphFromRDFRepresentation expects targetId to be a string or null.");
  }

  // Initialize traversal state
  const initialState = {
    nodes: {},
    links: [],
    seen: new Set()
  };

  let finalState = { ...initialState };

  try {
    if (targetId) {
      const targetExists = jsonld.some(e => e["@id"] === targetId);
      if (!targetExists) {
        console.warn(`Target node '${targetId}' not found.`);
        return { nodes: [], links: [] };
      }

      finalState = window.MyFunctions.recursivelyTraceEntityRelations(jsonld, targetId, finalState, maxDepth, 0);
    } else {
      // Full graph traversal
const allIds = jsonld
  .filter(e => typeof e["@id"] === "string" && e["@id"].trim().length > 0)
  .map(e => e["@id"]);


      for (const id of allIds) {
        finalState = window.MyFunctions.recursivelyTraceEntityRelations(jsonld, id, finalState, maxDepth, 0);
      }

      // Include isolated nodes that may not have links
      for (const entity of jsonld) {
        const id = entity["@id"];
        if (!finalState.nodes[id]) {
          try {
            const properties = window.MyFunctions.deriveRepresentationalAttributes(jsonld, id);
            finalState.nodes[id] = window.MyFunctions.constructGraphNodeRepresentation(id, properties, jsonld);
          } catch (err) {
            console.warn(`Skipped isolated node ${id}: ${err.message}`);
          }
        }
      }
    }
  } catch (err) {
    throw new Error("Graph traversal failed: " + err.message);
  }

  // Deduplicate and filter links
  let filteredLinks;
  try {
    const validNodeIds = new Set(Object.keys(finalState.nodes));
    const uniqueLinks = window.MyFunctions.eliminateRedundantLinkAssertions(finalState.links);
    filteredLinks = window.MyFunctions.restrictLinksToExistingEntities(uniqueLinks, validNodeIds);
  } catch (err) {
    throw new Error("Link post-processing failed: " + err.message);
  }

  console.log("Graph generation complete:", {
    nodeCount: Object.keys(finalState.nodes).length,
    linkCount: filteredLinks.length
  });

  return {
    nodes: Object.values(finalState.nodes),
    links: filteredLinks
  };
};
