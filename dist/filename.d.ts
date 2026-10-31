/** Validate a portable basename without trimming, normalizing, or silently renaming it. */
export declare function validateEmbeddedYamlFilename(filename: string): string;
/** Validate an already normalized relative POSIX path; basename validation remains separate. */
export declare function validateEmbeddedYamlRelativePath(path: string): string;
