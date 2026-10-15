import * as nostrChallenge from '../server-api/auth/nostr/challenge.js';
import * as nostrSession from '../server-api/auth/nostr/session.js';
import * as authSession from '../server-api/auth/session.js';
import * as conversationGenerations from '../server-api/conversations/[id]/generations.js';
import * as conversationMessages from '../server-api/conversations/[id]/messages.js';
import * as generationCancel from '../server-api/generations/[id]/cancel.js';
import * as generation from '../server-api/generations/[id]/index.js';
import * as publishCommit from '../server-api/publish/commit.js';
import * as publishPrepare from '../server-api/publish/prepare.js';
import * as publishUpload from '../server-api/publish/upload.js';
import * as storyCapabilities from '../server-api/stories/[id]/capabilities.js';
import * as storyMemoryReview from '../server-api/stories/[id]/memory/[memoryId]/review.js';
import * as storyMemory from '../server-api/stories/[id]/memory/index.js';
import * as storyOperations from '../server-api/stories/[id]/operations.js';
import * as storyWorkspaces from '../server-api/stories/[id]/workspaces.js';
import * as workspaceAssetContent from '../server-api/workspaces/[id]/assets/[assetId]/content.js';
import * as workspaceAssets from '../server-api/workspaces/[id]/assets/index.js';
import * as workspaceAccept from '../server-api/workspaces/[id]/accept.js';
import * as workspaceCommit from '../server-api/workspaces/[id]/commit.js';
import * as workspaceConversations from '../server-api/workspaces/[id]/conversations.js';
import * as workspaceDiscard from '../server-api/workspaces/[id]/discard.js';
import * as workspace from '../server-api/workspaces/[id]/index.js';
import * as workspaceRebase from '../server-api/workspaces/[id]/rebase.js';
import * as revisionPackage from '../server-api/workspaces/[id]/revisions/[revisionId]/package/[...path].js';
import * as revisionPreviewAck from '../server-api/workspaces/[id]/revisions/[revisionId]/preview-ack.js';
import * as revisionRestore from '../server-api/workspaces/[id]/revisions/[revisionId]/restore.js';
import * as revisionStory from '../server-api/workspaces/[id]/revisions/[revisionId]/story.js';
import * as workspaceRevisions from '../server-api/workspaces/[id]/revisions/index.js';
import * as revisionShares from '../server-api/workspaces/[id]/revisions/[revisionId]/shares.js';
import * as workspaceTestMutation from '../server-api/workspaces/[id]/test-mutation.js';
import * as uploadComplete from '../server-api/workspaces/[id]/uploads/complete.js';
import * as uploadPrepare from '../server-api/workspaces/[id]/uploads/prepare.js';
import * as shareRedeem from '../server-api/shares/redeem.js';
import * as share from '../server-api/shares/[id]/index.js';
import * as sharedPackage from '../server-api/shared-stories/[storyId]/[grantId]/package/[...path].js';

type Handler = (request: Request) => Promise<Response>;
type Methods = Partial<Record<'GET' | 'POST' | 'DELETE', Handler>>;

const routes: readonly [RegExp, Methods][] = [
  [/^\/api\/auth\/nostr\/challenge$/, nostrChallenge],
  [/^\/api\/auth\/nostr\/session$/, nostrSession],
  [/^\/api\/auth\/session$/, authSession],
  [/^\/api\/conversations\/[^/]+\/generations$/, conversationGenerations],
  [/^\/api\/conversations\/[^/]+\/messages$/, conversationMessages],
  [/^\/api\/generations\/[^/]+\/cancel$/, generationCancel],
  [/^\/api\/generations\/[^/]+$/, generation],
  [/^\/api\/publish\/commit$/, publishCommit],
  [/^\/api\/publish\/prepare$/, publishPrepare],
  [/^\/api\/publish\/upload$/, publishUpload],
  [/^\/api\/stories\/[^/]+\/capabilities$/, storyCapabilities],
  [/^\/api\/stories\/[^/]+\/memory\/[^/]+\/review$/, storyMemoryReview],
  [/^\/api\/stories\/[^/]+\/memory$/, storyMemory],
  [/^\/api\/stories\/[^/]+\/operations$/, storyOperations],
  [/^\/api\/stories\/[^/]+\/workspaces$/, storyWorkspaces],
  [/^\/api\/shares\/redeem$/, shareRedeem],
  [/^\/api\/shares\/[^/]+$/, share],
  [/^\/api\/shared-stories\/[^/]+\/[^/]+\/package\/.+$/, sharedPackage],
  [/^\/api\/workspaces\/[^/]+\/assets\/[^/]+\/content$/, workspaceAssetContent],
  [/^\/api\/workspaces\/[^/]+\/assets$/, workspaceAssets],
  [/^\/api\/workspaces\/[^/]+\/accept$/, workspaceAccept],
  [/^\/api\/workspaces\/[^/]+\/commit$/, workspaceCommit],
  [/^\/api\/workspaces\/[^/]+\/conversations$/, workspaceConversations],
  [/^\/api\/workspaces\/[^/]+\/discard$/, workspaceDiscard],
  [/^\/api\/workspaces\/[^/]+\/rebase$/, workspaceRebase],
  [/^\/api\/workspaces\/[^/]+\/revisions\/[^/]+\/package\/.+$/, revisionPackage],
  [/^\/api\/workspaces\/[^/]+\/revisions\/[^/]+\/preview-ack$/, revisionPreviewAck],
  [/^\/api\/workspaces\/[^/]+\/revisions\/[^/]+\/restore$/, revisionRestore],
  [/^\/api\/workspaces\/[^/]+\/revisions\/[^/]+\/story$/, revisionStory],
  [/^\/api\/workspaces\/[^/]+\/revisions\/[^/]+\/shares$/, revisionShares],
  [/^\/api\/workspaces\/[^/]+\/revisions$/, workspaceRevisions],
  [/^\/api\/workspaces\/[^/]+\/test-mutation$/, workspaceTestMutation],
  [/^\/api\/workspaces\/[^/]+\/uploads\/complete$/, uploadComplete],
  [/^\/api\/workspaces\/[^/]+\/uploads\/prepare$/, uploadPrepare],
  [/^\/api\/workspaces\/[^/]+$/, workspace],
];

async function dispatch(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const rewrittenPath = url.searchParams.get('__route');
  const pathname = rewrittenPath ? `/api/${rewrittenPath}` : url.pathname;
  const route = routes.find(([pattern]) => pattern.test(pathname));
  if (!route) return Response.json({ error: { code: 'not_found', message: 'API route not found.' } }, { status: 404 });
  const handler = route[1][request.method as keyof Methods];
  if (!handler) return Response.json({ error: { code: 'method_not_allowed', message: 'Method not allowed.' } }, {
    status: 405,
    headers: { allow: Object.keys(route[1]).join(', ') },
  });
  return handler(request);
}

export const GET = dispatch;
export const POST = dispatch;
export const DELETE = dispatch;
