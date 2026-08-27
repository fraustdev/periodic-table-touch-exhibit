/**
 * A display is a `<main>` when it owns its window, and a `<section>` when the
 * combined route mounts both in one document — a document may only have one
 * main landmark. Nothing else about a display changes between the two.
 */
export type LandmarkProps = { landmark?: "main" | "section" };
