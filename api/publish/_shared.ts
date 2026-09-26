import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { BlobNotFoundError, get, head, type HeadBlobResult } from '@vercel/blob';
import { validateStory } from '../../src/parser/parse.js';

export const MAX_FILES = 256;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_PACKAGE_BYTES = 100 * 1024 * 1024;
export const STORY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const PUBLISH_ID = STORY_ID;
const ASSET_PATH = /^(?:assets|cards)\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:svg|png|jpg|jpeg|webp|avif)$/;

export interface PublishFile {
  path: string;
  size: number;
  sha256: string;
  contentType: string;
}

export interface PublishClaims {
  kind: 'publish';
  publisher: string;
  publishId: string;
  storyId: string;
  manifestHash: string;
  baseRevision: string | null;
  expiresAt: number;
}

export interface UploadClaims {
  kind: 'upload';
  publisher: string;
  publishId: string;
  storyId: string;
  file: PublishFile;
  expiresAt: number;
}

export class PublishError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function errorResponse(error: unknown): Response {
  const safe = error instanceof PublishError
    ? error
    : new PublishError(500, 'internal_error', 'The story could not be published.');
  if (!(error instanceof PublishError)) console.error('Publish failure', error);
  return Response.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
}

export function blobToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new PublishError(500, 'internal_error', 'Publishing storage is unavailable.');
  return token;
}

function publishingSecret(): string {
  const secret = process.env.SCROLLTASTIC_PUBLISH_SECRET;
  if (!secret || secret.length < 32) throw new PublishError(500, 'internal_error', 'Publishing authorization is unavailable.');
  return secret;
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function signClaims<T extends PublishClaims | UploadClaims>(claims: T, secret = publishingSecret()): string {
  const payload = encode(claims);
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyClaims<T extends PublishClaims | UploadClaims>(token: unknown, kind: T['kind'], secret = publishingSecret()): T {
  if (typeof token !== 'string') throw new PublishError(400, 'invalid_manifest', 'The publish authorization is missing.');
  const [payload, supplied, extra] = token.split('.');
  if (!payload || !supplied || extra) throw new PublishError(400, 'invalid_manifest', 'The publish authorization is invalid.');
  const expected = createHmac('sha256', secret).update(payload).digest();
  let actual: Buffer;
  try { actual = Buffer.from(supplied, 'base64url'); }
  catch { throw new PublishError(400, 'invalid_manifest', 'The publish authorization is invalid.'); }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new PublishError(400, 'invalid_manifest', 'The publish authorization is invalid.');
  let claims: unknown;
  try { claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); }
  catch { throw new PublishError(400, 'invalid_manifest', 'The publish authorization is invalid.'); }
  if (!claims || typeof claims !== 'object' || (claims as { kind?: unknown }).kind !== kind) throw new PublishError(400, 'invalid_manifest', 'The publish authorization is invalid.');
  const typed = claims as T;
  if (!Number.isSafeInteger(typed.expiresAt) || typed.expiresAt < Date.now()) throw new PublishError(410, 'upload_expired', 'The publish authorization has expired.');
  return typed;
}

export async function requirePublisher(request: Request): Promise<string> {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) throw new PublishError(401, 'unauthenticated', 'Sign in with GitHub to publish.');
  const response = await fetch('https://api.github.com/user', {
    headers: { authorization, accept: 'application/vnd.github+json', 'user-agent': 'scrolltastic-publisher' },
  });
  if (!response.ok) throw new PublishError(401, 'unauthenticated', 'Your GitHub session is no longer valid.');
  const value: unknown = await response.json();
  const login = value && typeof value === 'object' && 'login' in value && typeof value.login === 'string' ? value.login.toLowerCase() : '';
  const allowed = new Set((process.env.SCROLLTASTIC_PUBLISHERS ?? '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean));
  if (!login || !allowed.has(login)) throw new PublishError(403, 'forbidden', 'This GitHub account is not authorized to publish stories.');
  return login.replace(/[^a-z0-9-]/g, '-');
}

export function contentTypeForPath(pathname: string): string | undefined {
  if (pathname === 'story.json') return 'application/json';
  const extension = pathname.split('.').pop();
  return ({ svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif' } as Record<string, string>)[extension ?? ''];
}

export function validateStoryId(value: unknown): string {
  if (typeof value !== 'string' || !STORY_ID.test(value)) throw new PublishError(400, 'invalid_manifest', 'A valid V5 story ID is required.');
  return value;
}

export function validatePublishId(value: unknown): string {
  if (typeof value !== 'string' || !PUBLISH_ID.test(value)) throw new PublishError(400, 'invalid_manifest', 'The publish ID is invalid.');
  return value;
}

export function validateRelativePath(value: unknown): string {
  if (value === 'story.json' || (typeof value === 'string' && ASSET_PATH.test(value))) return value;
  throw new PublishError(400, 'invalid_manifest', 'The package contains an invalid path.');
}

export function validateManifest(value: unknown): PublishFile[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_FILES) throw new PublishError(400, 'invalid_manifest', 'The package has an invalid number of files.');
  const seen = new Set<string>();
  let total = 0;
  const files = value.map(item => {
    if (!item || typeof item !== 'object') throw new PublishError(400, 'invalid_manifest', 'The package manifest is invalid.');
    const record = item as Record<string, unknown>;
    const path = validateRelativePath(record.path);
    const expectedType = contentTypeForPath(path);
    if (typeof record.size !== 'number' || !Number.isSafeInteger(record.size) || record.size < 1 || record.size > MAX_FILE_BYTES) throw new PublishError(413, 'package_too_large', `File ${path} has an invalid size.`);
    if (typeof record.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(record.sha256)) throw new PublishError(400, 'invalid_manifest', `File ${path} has an invalid digest.`);
    if (record.contentType !== expectedType) throw new PublishError(400, 'invalid_manifest', `File ${path} has an invalid content type.`);
    if (seen.has(path)) throw new PublishError(400, 'invalid_manifest', `File ${path} appears more than once.`);
    seen.add(path);
    total += record.size;
    return { path, size: record.size, sha256: record.sha256, contentType: record.contentType } as PublishFile;
  });
  if (!seen.has('story.json')) throw new PublishError(400, 'invalid_manifest', 'The package requires story.json.');
  if (total > MAX_PACKAGE_BYTES) throw new PublishError(413, 'package_too_large', 'The story package is larger than 100 MiB.');
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export function manifestHash(files: PublishFile[]): string {
  return createHash('sha256').update(JSON.stringify(files)).digest('hex');
}

export function validateBaseRevision(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.length < 1 || value.length > 256) throw new PublishError(400, 'invalid_manifest', 'The base revision is invalid.');
  return value;
}

export function stagingPrefix(publisher: string, publishId: string, storyId: string): string {
  return `_staging/${publisher}/${publishId}/${storyId}/`;
}

export async function optionalHead(pathname: string): Promise<HeadBlobResult | undefined> {
  try { return await head(pathname, { token: blobToken() }); }
  catch (error) {
    if (error instanceof BlobNotFoundError) return undefined;
    throw error;
  }
}

export async function readAndVerify(pathname: string, file: PublishFile): Promise<Uint8Array> {
  const result = await get(pathname, { access: 'public', token: blobToken(), useCache: false });
  if (!result || result.statusCode !== 200) throw new PublishError(400, 'upload_incomplete', `File ${file.path} was not uploaded.`);
  const bytes = new Uint8Array(await new Response(result.stream).arrayBuffer());
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (bytes.byteLength !== file.size || digest !== file.sha256 || result.blob.contentType !== file.contentType) {
    throw new PublishError(400, 'upload_incomplete', `File ${file.path} does not match the prepared package.`);
  }
  return bytes;
}

export function validatePublishedStory(bytes: Uint8Array, storyId: string, files: PublishFile[]): void {
  const result = validateStory(new TextDecoder().decode(bytes));
  if (!result.document) throw new PublishError(400, 'invalid_story', result.diagnostics[0]?.message ?? 'The story document is invalid.');
  if (result.document.id !== storyId) throw new PublishError(400, 'invalid_story', 'The story document ID does not match its package.');
  const references = new Set<string>();
  const visit = (node: unknown) => {
    if (Array.isArray(node)) node.forEach(visit);
    else if (node && typeof node === 'object') {
      for (const [key, child] of Object.entries(node)) {
        if (key === 'src' && typeof child === 'string' && ASSET_PATH.test(child)) references.add(child);
        else visit(child);
      }
    }
  };
  visit(result.document);
  const paths = new Set(files.map(file => file.path));
  for (const reference of references) if (!paths.has(reference)) throw new PublishError(400, 'missing_asset', `Referenced asset ${reference} is missing.`);
}

export function newPublishId(): string { return randomUUID(); }
