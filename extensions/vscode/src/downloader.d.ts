export interface DownloadedStoryFile {
  path: string;
  bytes: Buffer;
}

export interface DownloadedStoryPackage {
  story: Record<string, unknown> & { title: string };
  files: DownloadedStoryFile[];
  total: number;
}

export function archiveFilename(folderName: string, now: Date): string;
export function downloadStoryRoot(vscode: unknown): string;
export function storyIdFromInput(value: string | null | undefined): string;
export function fetchLivePackage(
  vscode: unknown,
  storyId: string,
  fetcher?: typeof fetch,
): Promise<DownloadedStoryPackage>;
export function downloadLiveStory(
  vscode: unknown,
  document: unknown,
  output: unknown,
): Promise<unknown>;

declare const downloader: {
  archiveFilename: typeof archiveFilename;
  downloadLiveStory: typeof downloadLiveStory;
  downloadStoryRoot: typeof downloadStoryRoot;
  fetchLivePackage: typeof fetchLivePackage;
  storyIdFromInput: typeof storyIdFromInput;
};

export default downloader;
