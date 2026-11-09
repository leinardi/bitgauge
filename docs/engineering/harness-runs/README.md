# Harness Runs

One file per release, `<version>.md`, written by the maintainer before the release is tagged: the
manual floor and ceiling tiers of the accuracy harness, the real-device runs, the real Safari
checks and the environmental notes, in the order
[accuracy-harness.md §5](../accuracy-harness.md#5-record-the-results) gives. The release waits for
it ([release.md](../../release.md#how-to-release),
[testing.md §6](../../features/technical-stack/testing.md#6-ci-placement)).

The CI tier is not recorded here as a rule: it runs in CI through `harness.yaml`, and its report
is that run's artifact. [`0.1.0.md`](0.1.0.md) is the exception: v0.1.0 shipped on the CI tier
alone, so its file records that tier and says which tiers were not run.

A failed or inconclusive profile is recorded as such, with its re-run beside it, never replaced by a
later pass, so that the next release can be compared with this one.
