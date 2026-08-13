/**
 * @returns {object[]} Cytoscape stylesheet.
 */
export function createDefaultCytoscapeStylesheet() {
  return [
    {
      selector: 'node',
      style: {
        label: 'data(label)',
        shape: 'round-rectangle',
        width: 'data(visualWidth)',
        height: 'data(visualHeight)',
        padding: '0px',
        'text-wrap': 'wrap',
        'text-max-width': 'data(textMaxWidth)',
        'text-halign': 'center',
        'text-valign': 'center',
        'font-size': 11,
        'background-color': '#f3f4f6',
        'border-width': 2,
        'border-color': '#6b7280',
        color: '#111827'
      }
    },
    { selector: 'node[kind = "class"]', style: { 'background-color': '#fef3c7', 'border-color': '#b45309' } },
    { selector: 'node[kind = "object-property"]', style: { 'background-color': '#cffafe', 'border-color': '#0369a1' } },
    { selector: 'node[kind = "datatype-property"]', style: { 'background-color': '#dcfce7', 'border-color': '#15803d' } },
    { selector: 'node[kind = "annotation-property"]', style: { 'background-color': '#fed7aa', 'border-color': '#c2410c' } },
    { selector: 'node[kind = "ontology"]', style: { 'background-color': '#fee2e2', 'border-color': '#b91c1c' } },
    { selector: 'node[kind = "named-individual"]', style: { 'background-color': '#ede9fe', 'border-color': '#6d28d9' } },
    { selector: 'node[kind = "axiom-support"]', style: { 'background-color': '#f9fafb', 'border-color': '#9ca3af', 'border-style': 'dashed' } },
    { selector: 'node[kind = "blank-node"]', style: { 'background-color': '#e5e7eb', 'border-color': '#4b5563' } },
    { selector: 'node[kind = "literal"]', style: { 'background-color': '#ecfdf5', 'border-color': '#047857', shape: 'rectangle' } },
    {
      selector: 'edge',
      style: {
        label: 'data(label)',
        width: 1.5,
        'line-color': '#6b7280',
        'target-arrow-color': '#6b7280',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        'font-size': 10,
        'text-background-color': '#ffffff',
        'text-background-opacity': 0.86,
        'text-background-padding': 2,
        'text-rotation': 'autorotate'
      }
    },
    { selector: 'edge[kind = "datatype"]', style: { 'line-color': '#15803d', 'target-arrow-color': '#15803d' } },
    { selector: ':selected', style: { 'border-color': '#2563eb', 'line-color': '#2563eb', 'target-arrow-color': '#2563eb' } }
  ];
}
