# Phase M1 — bounded public media reads

Date: 2026-10-07 Asia/Shanghai.
Status: requested-DOI duplicate-hash lookup installed.

## Problem

The public media path is DOI-bounded at the API boundary, but every call to `loadMediaRows()` previously performed a second query that grouped the entire rebuilt `toc_assets` table by content hash to detect duplicate TOC images.

That made even a six-DOI visible-window request contain one operation whose cost grew with the global TOC corpus.

## Fix

Duplicate detection now has two stages:

1. read the requested DOI rows only;
2. collect only the non-empty content hashes present in those requested TOC rows and query owner counts for those hashes in bounded chunks.

The duplicate decision is still global: each requested hash is counted against all current TOC owners in D1. What is removed is the unrelated whole-table aggregation over hashes that are not relevant to the request.

## Invariant

A normal media batch may perform work proportional to the number of requested DOI/hash keys, but it may not group or scan the full TOC corpus solely to answer duplicate status for an unrelated small request.

This change does not alter Tampermonkey acquisition authority, TOC promotion rules, media repair authority, or private PDF handling.
