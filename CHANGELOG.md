# Changelog

[npm history][1]

[1]: https://www.npmjs.com/package/nodejs-logging?activeTab=versions

## v3.0.2

This release contains a variety of minor internal changes.

### Internal / Testing Changes
- chore: upgrade to the latest common-grpc (#203)
- Re-generate library using /synth.py (#202)
- chore(deps): update dependency nyc to v13 (#200)
- chore(deps): update samples dependency @google-cloud/logging-bunyan to ^0.9.0 (#199)
- fix(deps): update dependency google-gax to ^0.19.0 (#198)
- chore: use mocha for sample tests (#197)

## v3.0.1

### Fixes
- fix(deps): update dependency @google-cloud/logging to v3 (#195)
- fix(gke): correctly detect kubernetes engine (#193)

## v3.0.0

**This should not have been a semver major release.  There are no breaking changes.**

### Bug fixes
- fix(gke): include namespace_id in resource (#191)
- fix: drop support for node.js 4.x and 9.x (#161)
- Re-generate library using /synth.py (#154)

### Keepin' the lights on
- chore(deps): update dependency eslint-config-prettier to v3 (#190)
- chore: do not use npm ci (#189)
- chore: ignore package-lock.json (#186)
- chore: update renovate config (#184)
- remove that whitespace (#183)
- fix(deps): update dependency google-gax to ^0.18.0 (#182)
- chore(deps): lock file maintenance (#181)
- setup: just npm ci in synth.py (#180)
- chore: move mocha options to mocha.opts (#177)
- chore: require node 8 for samples (#179)
- fix(deps): update dependency fluent-logger to v3 (#172)
- fix: get eslint passing (#174)
- chore(deps): update dependency eslint-plugin-node to v7 (#169)
- test: use strictEqual in tests (#170)
- fix(deps): update dependency gcp-metadata to ^0.7.0 (#166)
- fix(deps): update dependency @google-cloud/logging to v2 (#157)

