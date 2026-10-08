# Infrastructure guidance

- Use AWS CDK v2 with TypeScript and prefer L2 constructs.
- Keep construct IDs stable and concise.
- Set explicit removal and log-retention policies.
- The current deployment shape is private S3 + CloudFront and HTTP API + Lambda.
- Keep DSQL, ingestion, and Phase 3 scheduled auction workers opt-in until their writers are validated; retain stateful data resources. Route 53/ACM remain later-phase additions.
- Run typechecking and `cdk synth --strict` after infrastructure changes.
