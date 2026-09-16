# Chinese title loading

The Pages entrypoint preloads the static Chinese-title table into the existing browser cache before importing `src/main.ts`. Curated records also carry `titleZh`, which is merged into that table at build time. This keeps the existing Gallery implementation intact while making language switching deterministic for newly added cards.
