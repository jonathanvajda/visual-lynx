/**
 * Returns first-degree neighbor node IDs for a graph node.
 *
 * @param {object} graphState
 * @param {string} nodeId
 * @returns {string[]}
 */
export function getFirstDegreeNeighborNodeIds(graphState, nodeId) {
  const neighborIds = new Set();
  for (const edge of graphState?.edges || []) {
    if (edge.subjectId === nodeId) neighborIds.add(edge.objectId);
    if (edge.objectId === nodeId) neighborIds.add(edge.subjectId);
  }
  neighborIds.delete(nodeId);
  return Array.from(neighborIds).sort();
}

/**
 * Computes dampened neighbor positions for a dragged graph node.
 *
 * This keeps the canvas interaction state outside RDF semantics. The dragged node
 * moves normally; neighbors receive a fraction of the drag delta so local
 * neighborhoods stay visually coherent during manual adjustment.
 *
 * @param {{x: number, y: number}} draggedStartPosition
 * @param {{x: number, y: number}} draggedCurrentPosition
 * @param {Map<string, {x: number, y: number}>} neighborStartPositionsById
 * @param {{strength?: number}} [options]
 * @returns {Map<string, {x: number, y: number}>}
 */
export function calculateNeighborNudgePositions(
  draggedStartPosition,
  draggedCurrentPosition,
  neighborStartPositionsById,
  options = {}
) {
  const strength = clamp(Number(options.strength ?? 0.35), 0, 1);
  const dx = (draggedCurrentPosition?.x || 0) - (draggedStartPosition?.x || 0);
  const dy = (draggedCurrentPosition?.y || 0) - (draggedStartPosition?.y || 0);
  const positionsById = new Map();

  for (const [nodeId, position] of neighborStartPositionsById || []) {
    positionsById.set(nodeId, Object.freeze({
      x: position.x + dx * strength,
      y: position.y + dy * strength
    }));
  }

  return positionsById;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
