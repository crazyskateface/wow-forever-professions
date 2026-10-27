# Anonymous product analytics

Forever Professions uses first-party, anonymous product events to understand whether
the Leatherworking workflow is usable. Events are accepted only by the shared strict
`productEventSchema`; unexpected fields are rejected rather than discarded.

## Privacy boundary

The event contract permits only:

- the public Forever build identifier;
- route preset and complete/blocked status;
- aggregate route segment counts;
- aggregate completed and total checklist segment counts;
- shopping strategy and complete/partial status;
- a route blocker reason; and
- a broad missing-data category.

Events never contain character or account identity, credentials, IP address,
user-agent, recipe IDs, item IDs, market or realm selection, faction, known recipes,
owned quantities, imported game data, checklist item identities, free-form text, or a
session/user identifier. The browser request explicitly omits credentials and the
referrer. Events are operational metrics, not profiles, and cannot be joined into a
per-user journey by an application identifier.

Ordinary hosting and API infrastructure may process request metadata as described in
the privacy policy. The configured API access-log format does not include source IP or
user-agent. Application and access logs use the existing stage-specific retention:
seven days in staging and fourteen days in production.

## Events

| Event | Purpose | Allowed measurements |
| --- | --- | --- |
| `route-generated` | Route generation baseline | build, preset, status, segment count |
| `route-blocked` | Blocked-route baseline | build, preset, blocker reason |
| `first-step-engaged` | Whether a generated route is acted on | build, preset |
| `checklist-progress` | Aggregate checklist adoption/completion | build, preset, completed/total segment counts |
| `shopping-used` | Shopping workflow adoption and partial-result rate | build, preset, strategy, status |
| `missing-data-encountered` | Which evidence gaps players see | build, broad gap category |

The Lambda event sink writes one structured JSON log record per accepted event. Local
development uses the same shape. Analytics failures are intentionally non-blocking in
the browser and do not change route, shopping, or checklist behavior.

## Change rules

Any new event or field requires all of the following in the same reviewed change:

1. update this privacy boundary and the public privacy policy;
2. add the field to the strict shared contract and its rejection tests;
3. document its product decision and retention need; and
4. verify that it cannot encode identity, credentials, owned items, imported game
   data, or free-form user content.

Do not add third-party analytics scripts, cookies, fingerprinting, cross-site
identifiers, or a stable first-party user/session ID under this boundary.
