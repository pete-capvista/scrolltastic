import { isDeepStrictEqual } from 'node:util';

export type PatchValue = null | boolean | number | string | PatchValue[] | { [key: string]: PatchValue };

export type AuthoringOperation =
  | { type: 'set-property'; targetId: string; property: string; expected: PatchValue; value: PatchValue }
  | { type: 'remove-property'; targetId: string; property: string; expected: PatchValue }
  | { type: 'insert-child'; parentId: string; collection: 'frames' | 'flow'; expectedBeforeId: string | null; child: { id: string; type: string; [key: string]: PatchValue } }
  | { type: 'remove-child'; parentId: string; collection: 'frames' | 'flow'; targetId: string; expected: PatchValue }
  | { type: 'move-child'; parentId: string; collection: 'frames' | 'flow'; targetId: string; expectedIndex: number; beforeId: string | null };

export interface PatchDiff { operation: AuthoringOperation['type']; path: string; before?: unknown; after?: unknown }
export interface PatchApplication { document: unknown; diff: PatchDiff[] }

export class PatchError extends Error {
  constructor(public code: 'invalid_operation' | 'unresolved_target' | 'failed_precondition' | 'protected_path', message: string) { super(message); }
}

const PROTECTED_PROPERTIES = new Set(['id', 'type', 'storyLanguage', 'authoring', 'production', 'release', 'revision', 'body', 'containers', 'frames', 'flow']);
const PROPERTY = /^[A-Za-z][A-Za-z0-9]*$/;

function authoredId(value: unknown): string | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) && typeof (value as { id?: unknown }).id === 'string'
    ? (value as { id: string }).id : undefined;
}

function findById(root: unknown, id: string): Record<string, unknown> | undefined {
  if (!root || typeof root !== 'object') return undefined;
  if (!Array.isArray(root) && authoredId(root) === id) return root as Record<string, unknown>;
  for (const child of Array.isArray(root) ? root : Object.values(root)) {
    const found = findById(child, id); if (found) return found;
  }
  return undefined;
}

function uniqueTarget(root: unknown, id: string): Record<string, unknown> {
  let found: Record<string, unknown> | undefined; let count = 0;
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (!Array.isArray(value) && authoredId(value) === id) { found = value as Record<string, unknown>; count += 1; }
    for (const child of Array.isArray(value) ? value : Object.values(value)) visit(child);
  };
  visit(root);
  if (count !== 1 || !found) throw new PatchError('unresolved_target', count ? `Target ID ${id} is ambiguous.` : `Target ID ${id} was not found.`);
  return found;
}

function collection(root: unknown, parentId: string, key: 'frames' | 'flow'): unknown[] {
  const parent = uniqueTarget(root, parentId);
  const value = parent[key];
  if (!Array.isArray(value)) throw new PatchError('unresolved_target', `${parentId} does not have a ${key} collection.`);
  return value;
}

function requireProperty(property: string): void {
  if (!PROPERTY.test(property)) throw new PatchError('invalid_operation', 'Property names must be simple Story Language keys.');
  if (PROTECTED_PROPERTIES.has(property)) throw new PatchError('protected_path', `${property} cannot be changed by an AI proposal.`);
}

function insertionIndex(items: unknown[], beforeId: string | null): number {
  if (beforeId === null) return items.length;
  const index = items.findIndex(item => authoredId(item) === beforeId);
  if (index < 0) throw new PatchError('failed_precondition', `Expected insertion anchor ${beforeId} was not found.`);
  return index;
}

export function applyAuthoringOperations(base: unknown, operations: readonly AuthoringOperation[]): PatchApplication {
  if (!Array.isArray(operations) || operations.length < 1 || operations.length > 24) throw new PatchError('invalid_operation', 'A proposal requires 1–24 operations.');
  const document = structuredClone(base);
  const diff: PatchDiff[] = [];
  for (const operation of operations) {
    if (!operation || typeof operation !== 'object') throw new PatchError('invalid_operation', 'Every operation must be an object.');
    switch (operation.type) {
      case 'set-property': {
        requireProperty(operation.property);
        const target = uniqueTarget(document, operation.targetId);
        if (!Object.hasOwn(target, operation.property)) throw new PatchError('protected_path', `Property ${operation.property} is not present on ${operation.targetId}.`);
        if (!isDeepStrictEqual(target[operation.property], operation.expected)) throw new PatchError('failed_precondition', `Property ${operation.property} changed before the proposal was applied.`);
        const before = structuredClone(target[operation.property]); target[operation.property] = structuredClone(operation.value);
        diff.push({ operation: operation.type, path: `${operation.targetId}.${operation.property}`, before, after: operation.value });
        break;
      }
      case 'remove-property': {
        requireProperty(operation.property);
        const target = uniqueTarget(document, operation.targetId);
        if (!Object.hasOwn(target, operation.property) || !isDeepStrictEqual(target[operation.property], operation.expected)) throw new PatchError('failed_precondition', `Property ${operation.property} changed before the proposal was applied.`);
        const before = structuredClone(target[operation.property]); delete target[operation.property];
        diff.push({ operation: operation.type, path: `${operation.targetId}.${operation.property}`, before });
        break;
      }
      case 'insert-child': {
        if (!operation.child || typeof operation.child.id !== 'string' || typeof operation.child.type !== 'string') throw new PatchError('invalid_operation', 'Inserted children require stable id and type values.');
        if (findById(document, operation.child.id)) throw new PatchError('failed_precondition', `ID ${operation.child.id} already exists.`);
        const items = collection(document, operation.parentId, operation.collection);
        const index = insertionIndex(items, operation.expectedBeforeId);
        items.splice(index, 0, structuredClone(operation.child));
        diff.push({ operation: operation.type, path: `${operation.parentId}.${operation.collection}[${index}]`, after: operation.child });
        break;
      }
      case 'remove-child': {
        const items = collection(document, operation.parentId, operation.collection);
        const index = items.findIndex(item => authoredId(item) === operation.targetId);
        if (index < 0) throw new PatchError('unresolved_target', `Child ${operation.targetId} was not found in ${operation.parentId}.${operation.collection}.`);
        if (!isDeepStrictEqual(items[index], operation.expected)) throw new PatchError('failed_precondition', `Child ${operation.targetId} changed before the proposal was applied.`);
        const [before] = items.splice(index, 1);
        diff.push({ operation: operation.type, path: `${operation.parentId}.${operation.collection}[${index}]`, before });
        break;
      }
      case 'move-child': {
        const items = collection(document, operation.parentId, operation.collection);
        const index = items.findIndex(item => authoredId(item) === operation.targetId);
        if (index < 0) throw new PatchError('unresolved_target', `Child ${operation.targetId} was not found.`);
        if (index !== operation.expectedIndex) throw new PatchError('failed_precondition', `Child ${operation.targetId} moved before the proposal was applied.`);
        if (operation.beforeId === operation.targetId) throw new PatchError('invalid_operation', 'A child cannot be moved before itself.');
        const [item] = items.splice(index, 1);
        const destination = insertionIndex(items, operation.beforeId);
        items.splice(destination, 0, item);
        diff.push({ operation: operation.type, path: `${operation.parentId}.${operation.collection}`, before: index, after: destination });
        break;
      }
      default: throw new PatchError('invalid_operation', `Unsupported operation type: ${(operation as { type?: unknown }).type}.`);
    }
  }
  return { document, diff };
}
