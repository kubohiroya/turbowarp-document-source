export {
  canPatchProject as canPatchProjectRepresentations,
  installProjectPatchWorkspaceAdapter,
  projectPatchWorkspaceAdapterSymbol,
} from "./project-patch.js";
import type {
  SourceDocumentAdapter,
  SourceDocumentReference,
  SourceDocumentPreview,
} from "@kubohiroya/turbowarp-document-data/composition";
export function createProjectRepresentationAdapter(options: {
  vm: any;
  adapter: SourceDocumentAdapter;
  reference: SourceDocumentReference;
  buildPreviewArtifact?(input: {
    project: any;
    source: string;
    reference: SourceDocumentReference;
    kind: string;
  }):
    | Promise<{
        preview: SourceDocumentPreview;
        candidate?: {
          request: { kind: string; direction: "from-source" | "to-source" };
          project: any;
          source: string;
          summary: string;
        };
      }>
    | {
        preview: SourceDocumentPreview;
        candidate?: {
          request: { kind: string; direction: "from-source" | "to-source" };
          project: any;
          source: string;
          summary: string;
        };
      };
  buildPreview?(input: {
    project: any;
    source: string;
    reference: SourceDocumentReference;
    kind: string;
  }): Promise<SourceDocumentPreview> | SourceDocumentPreview;
  buildCandidate(input: {
    project: any;
    source: string;
    reference: SourceDocumentReference;
    request: { kind: string; direction: "from-source" | "to-source" };
  }):
    | Promise<{ project: any; source: string; summary: string }>
    | { project: any; source: string; summary: string };
}): SourceDocumentAdapter;
