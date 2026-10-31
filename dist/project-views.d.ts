import { type ProjectPatchResult } from "./project-patch.ts";
export { canPatchProject as canPatchProjectRepresentations, installProjectPatchWorkspaceAdapter, projectPatchWorkspaceAdapterSymbol, } from "./project-patch.ts";
export type { ProjectPatchTargetChange, ProjectPatchWorkspaceAdapter, } from "./project-patch.ts";
import { type SourceDocumentAdapter, type SourceDocumentPreview, type SourceDocumentReference, type SourceDocumentSnapshot } from "@kubohiroya/turbowarp-document-data/composition";
export interface RepresentationRequest {
    kind: string;
    direction: "from-source" | "to-source";
}
export interface RepresentationCandidate {
    project: any;
    source: string;
    summary: string;
}
export interface RepresentationPreviewInput {
    project: any;
    source: string;
    reference: SourceDocumentReference;
    kind: string;
}
export interface RepresentationPreviewArtifact {
    preview: SourceDocumentPreview;
    candidate?: RepresentationCandidate & {
        request: RepresentationRequest;
    };
}
/** The VM surface observed here; project patches verify the rest themselves. */
export interface ProjectRepresentationVM {
    toJSON(optimize: undefined, options: {
        allowOptimization: false;
    }): string;
    runtime: {
        on?(event: string, listener: () => void): unknown;
        off?(event: string, listener: () => void): unknown;
    };
}
export interface ProjectRepresentationAdapterOptions {
    vm: ProjectRepresentationVM;
    adapter: SourceDocumentAdapter;
    reference: SourceDocumentReference;
    buildPreviewArtifact?: ((input: RepresentationPreviewInput) => Promise<RepresentationPreviewArtifact> | RepresentationPreviewArtifact) | undefined;
    buildPreview?: ((input: RepresentationPreviewInput) => Promise<SourceDocumentPreview> | SourceDocumentPreview) | undefined;
    buildCandidate(input: {
        project: any;
        source: string;
        reference: SourceDocumentReference;
        request: RepresentationRequest;
    }): Promise<RepresentationCandidate> | RepresentationCandidate;
}
export type ProjectRepresentationCommit = ProjectPatchResult & {
    source: string;
    representation: string;
    direction: RepresentationRequest["direction"];
};
/** The public handle of a prepared conversion; its project candidate stays private. */
export type ProjectRepresentationCandidate = Readonly<RepresentationRequest & {
    summary: string;
    source: string;
}>;
export type ProjectRepresentationAdapter = Omit<SourceDocumentAdapter, "prepareRepresentation" | "commitRepresentation"> & {
    prepareRepresentation(snapshot: SourceDocumentSnapshot, request: RepresentationRequest): Promise<ProjectRepresentationCandidate>;
    commitRepresentation(snapshot: SourceDocumentSnapshot, candidate: ProjectRepresentationCandidate): Promise<ProjectRepresentationCommit>;
};
/** Keep owner previews private and apply validated document changes through selective VM patches. */
export declare function createProjectRepresentationAdapter({ vm, adapter, reference, buildCandidate, buildPreview, buildPreviewArtifact, }: ProjectRepresentationAdapterOptions): ProjectRepresentationAdapter;
