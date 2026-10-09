# Go lint through the same pinned golangci-lint the pre-commit hook runs, over the whole module
# (golangci-lint v2, all linters; decisions.md section 9). Kept local until make-common's go.mk
# gains a go-lint target upstream.

.PHONY: go-lint
go-lint: check-installed-pre-commit ## Lint all Go code with golangci-lint (pre-commit pin)
	@pre-commit run golangci-lint-full --all-files
