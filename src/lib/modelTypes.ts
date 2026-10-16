export interface ModelAsset {
  id: string;
  name: string;
  kind: 'image' | 'video' | 'text' | 'pdf' | 'document';
  mime: string;
  sizeBytes: number;
}
export interface ModelSummary {
  id: string;
  title: string;
  description?: string;
  author?: string;
  license?: string;
  sizeBytes: number;
  fileCount: number;
  modelCount: number;
  formats: string[];
  previewCount: number;
  documentCount: number;
  coverAsset: { id: string; kind: string } | null;
  createdAt: string;
  apiBase: string;
  until?: number;
}
export interface ModelPackage extends ModelSummary {
  fileName: string;
  sha256: string;
  printSettings?: string;
  assembly?: string;
  files: { path: string; sizeBytes: number; format: string; kind: string }[];
  previews: ModelAsset[];
  documents: ModelAsset[];
  warnings: string[];
}
