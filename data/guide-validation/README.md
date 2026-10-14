# Generated guide validation

This directory stores build-stamped optimizer baselines and reports comparing them
with the explicitly sourced inputs under `data/guide-references/`.

With the full local API running, regenerate the default Leatherworking comparison:

```text
pnpm guide:validate
```

Optional positional arguments select a reference JSON file, output directory, and API
base URL:

```text
pnpm guide:validate data/guide-references/example.json data/guide-validation http://127.0.0.1:3001
```

Set `GUIDE_VALIDATION_GENERATED_AT` to a fixed ISO timestamp when a byte-for-byte
repeatable snapshot is needed. Reports are diagnostic only. Review disagreements and
obtain supported evidence before changing imported data or overrides.
