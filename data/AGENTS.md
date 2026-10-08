# Fixture and data guidance

- Fixture data is controlled Phase 1 input, not authoritative Forever data.
- Every dataset must identify a build and provenance/verification state.
- Never present Classic fallback values as verified Forever values.
- Phase 2 importers must preserve raw inputs by build and checksum before normalization; never overwrite build-specific facts.
