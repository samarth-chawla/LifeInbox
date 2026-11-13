export const maxUrlLength = 2048;
export const maxLinkTitleLength = 200;

export type LinkStatus = "queued" | "running" | "succeeded" | "failed";
export type SavedLink = {
  id: string;
  kind: "url";
  title: string;
  originalUrl: string;
  createdAt: string;
  updatedAt: string;
  status: LinkStatus;
  errorCode: string | null;
  canRetry: boolean;
  extractedTitle: string | null;
  description: string | null;
  extractedText: string | null;
};

export type SavedLinkSummary = Omit<SavedLink, "extractedTitle" | "description" | "extractedText">;
