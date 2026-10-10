// Shared contract v0.1. A owns changes; B/C consume these shapes.
export const CATEGORIES = [
  'customer_receipts', 'software_services', 'premises_utilities', 'travel',
  'other_operating_cash_activity', 'transfers_owner_movements', 'uncategorized',
] as const;
export type Category = typeof CATEGORIES[number];
export type ReviewStatus = 'proposed' | 'accepted' | 'rejected' | 'needs_review';
export type Direction = 'in' | 'out';
// JSON-safe integer paisa string; NEVER a floating-point rupee value.
export type MinorUnits = string;
export type ISODate = string;
export type SourceReference = { sourceId: string; rowNumber: number | null; kind?: 'manual_chat' | undefined };
export type Workspace = { id: string; ownerSubject: string; businessName: string; currency: 'PKR' };
export type Transaction = {
  id: string; workspaceId: string; source: SourceReference;
  date: ISODate; originalDescription: string; description: string;
  direction: Direction; amountMinor: MinorUnits; currency: 'PKR'; reference: string | null;
  category: Category | null; categoryStatus: ReviewStatus;
  matchStatus: 'unmatched' | 'proposed' | 'accepted';
};
export type DocumentFields = {
  counterparty: string | null; date: ISODate | null; totalMinor: MinorUnits | null;
  currency: string | null; reference: string | null;
};
export type SupportingDocument = {
  id: string; workspaceId: string; source: SourceReference;
  extractedFields: DocumentFields; correctedFields: DocumentFields | null;
  extractionStatus: 'pending' | 'complete' | 'failed'; reviewStatus: ReviewStatus;
  modelVersion: string | null; promptVersion: string | null;
};
export type CategoryProposal = {
  id: string; workspaceId: string; kind: 'category'; transactionId: string;
  category: Category; rationale: string; status: ReviewStatus;
};
export type MatchProposal = {
  id: string; workspaceId: string; kind: 'match'; transactionId: string;
  documentId: string; rationale: string; status: ReviewStatus;
};
export type ReviewDecision = {
  id: string; workspaceId: string; actorSubject: string; targetId: string;
  action: 'accept' | 'correct' | 'reject'; previous: unknown; current: unknown; createdAt: string;
};
export type AcceptedMatch = {
  id: string; workspaceId: string; transactionId: string; documentId: string; reviewDecisionId: string;
};
export type ApiErrorCode = 'UNAUTHENTICATED' | 'NOT_FOUND' | 'INVALID_INPUT' | 'CONFLICT' | 'UNAVAILABLE';
export type ApiResult<T> = { data: T; error: null } | { data: null; error: { code: ApiErrorCode; message: string } };
export type CashBucket = { inflowMinor: MinorUnits; outflowMinor: MinorUnits; netMovementMinor: MinorUnits };
export type CashSummary = CashBucket & {
  currency: 'PKR'; transactionCount: number; transactionIds: string[];
  unresolvedImportRowCount: number;
  categoryCoverage: { acceptedCount: number; notAcceptedCount: number };
  matchCoverage: { matchedCount: number; notMatchedCount: number };
  categories: Partial<Record<Category, CashBucket>>; unreviewed: CashBucket;
};
