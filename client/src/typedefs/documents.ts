// Shapes derived directly from documents.repository.js SELECT columns
// and documents.service.js response objects.

export interface DocumentTag {
  tag_name: string;
  colour: string;
}

export interface HubDocument {
  document_id: string;
  document_number: string;
  business: string;
  document_type: string;
  title: string;
  file_path: string;
  file_size_bytes: number;
  mime_type: string;
  content_hash: string;
  reference_type: string | null;
  reference_id: string | null;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  created_at: string;
  tags: DocumentTag[];
  is_deleted?: boolean;
  deleted_at?: string | null;
  deduplicated?: boolean;
}

export interface DocumentsResponse {
  data: HubDocument[];
  pagination: { page: number; limit: number; total: number };
}

export interface VerifyResult {
  document_id: string;
  document_number: string;
  verified: boolean;
  stored_hash: string;
  actual_hash: string;
  verified_at: string;
}

export interface TagStat {
  tag_name: string;
  colour: string;
  usage_count: number;
}

export interface DocumentsFilter {
  business?: string;
  document_type?: string;
  reference_type?: string;
  reference_id?: string;
  search?: string;
  tags?: string[];
  page?: number;
  limit?: number;
}

export interface UploadDocumentInput {
  file: File;
  business: string;
  document_type: string;
  title?: string;
  reference_type?: string;
  reference_id?: string;
  tags?: string[];
}
