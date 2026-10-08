# Shared package guidance

- `domain` must remain framework-independent and deterministic.
- `contracts` owns shared Zod schemas and inferred API types.
- Keep dependencies one-way: applications may depend on shared packages; domain logic must not depend on applications or AWS.
- Profession mechanics require boundary tests and must identify assumptions that are not verified for Forever.
- Model modifiers explicitly instead of embedding them in recipe values.
- Store auction currency as integer copper values. Missing price data is an explicit unavailable state, never a zero price.
- Keep vendor response shapes inside provider adapters; applications consume only normalized pricing contracts.
