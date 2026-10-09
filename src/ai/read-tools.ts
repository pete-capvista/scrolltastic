import type { AuthoringContext } from './context.js';
import { authoredNeighbourhood, findAuthoredElement } from './context.js';

export type ReadToolName = 'inspect_element' | 'inspect_neighbourhood' | 'list_assets' | 'ask_clarification';

export function executeReadTool(context: AuthoringContext, name: ReadToolName, input: Record<string, unknown>): unknown {
  switch (name) {
    case 'inspect_element': {
      const id = typeof input.id === 'string' ? input.id : context.selectedId;
      if (!id) return { found: false, reason: 'An element ID is required.' };
      const element = context.document ? findAuthoredElement(context.document, id) : id === context.selectedId ? context.selected : undefined;
      return element ? { found: true, id, element } : { found: false, id };
    }
    case 'inspect_neighbourhood': {
      const id = typeof input.id === 'string' ? input.id : context.selectedId;
      if (!id) return { found: false, reason: 'An element ID is required.' };
      const neighbourhood = context.document ? authoredNeighbourhood(context.document, id) : id === context.selectedId ? context.neighbourhood : undefined;
      return neighbourhood ? { found: true, id, neighbourhood } : { found: false, id };
    }
    case 'list_assets': {
      const query = typeof input.query === 'string' ? input.query.trim().toLowerCase() : '';
      const assets = query ? context.assets.filter(asset => asset.logicalPath.toLowerCase().includes(query) || asset.mediaType.includes(query)) : context.assets;
      return { assets: assets.slice(0, 50), truncated: assets.length > 50 };
    }
    case 'ask_clarification': {
      const question = typeof input.question === 'string' ? input.question.trim().slice(0, 500) : '';
      return question ? { clarificationRequired: true, question } : { clarificationRequired: true, question: 'Please clarify the requested change.' };
    }
  }
}
