#
# This file is part of BitGauge.
#
# Copyright (c) 2026 Roberto Leinardi
#
# BitGauge is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# BitGauge is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with BitGauge.  If not, see <http://www.gnu.org/licenses/>.
#
# The shipped image (build-packaging.md section 1). Every stage is a literal FROM pinned by digest,
# because Dependabot updates only literal FROM lines and a tag alone can be repointed under a build.
# All three bases come from dhi.io, so pulling them needs a dhi.io token.

########################
# web: build the SPA the binary embeds.
# Built here rather than copied from the build context's web/dist, so an image always carries a UI
# built from the same source tree as its binary. npm run build is vite build only: the type check
# is a CI gate, not a packaging step. Runs on the build platform; its output is architecture-free.
########################
FROM --platform=$BUILDPLATFORM dhi.io/node:24-alpine3.23-dev@sha256:ca452b9353334e104bc4531d5ad58de7ab8b9d3da401e788df19b4963b571a71 AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json web/.npmrc ./
RUN --mount=type=cache,target=/root/.npm,id=npmcache \
	npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

########################
# build: cross-compile the static binary on the build platform.
########################
FROM --platform=$BUILDPLATFORM dhi.io/golang:1.26-alpine3.23-dev@sha256:267350cad2ac48fab07d6ee38fbafaa49440888764929ff2e867d6a84e684652 AS build
ARG VERSION="dev"
ARG COMMIT="none"
ARG DATE="unknown"

# Set by buildx for each target platform.
ARG TARGETOS
ARG TARGETARCH

ENV CGO_ENABLED=0 \
	GOOS=${TARGETOS} \
	GOARCH=${TARGETARCH}

WORKDIR /src

# Modules first, so a source change does not refetch them.
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod,id=gomodcache \
	go mod download

# The source, then the SPA the web stage built; the build context carries no web/dist of its own.
COPY . .
COPY --from=web /src/web/dist ./web/dist

RUN --mount=type=cache,target=/go/pkg/mod,id=gomodcache \
	--mount=type=cache,target=/root/.cache/go-build \
	go build -trimpath -buildvcs=false \
		-ldflags="-s -w -X 'github.com/leinardi/bitgauge/internal/buildinfo.version=${VERSION}' -X 'github.com/leinardi/bitgauge/internal/buildinfo.commit=${COMMIT}' -X 'github.com/leinardi/bitgauge/internal/buildinfo.date=${DATE}'" \
		-o /out/bitgauge ./cmd/bitgauge

########################
# runtime: the shell-less dhi.io static base. The binary is CGO_ENABLED=0, so it needs no libc, and
# it writes nothing: the image declares no volume and runs on a read-only root filesystem.
########################
FROM dhi.io/static:20250419@sha256:98ef7a853608577e8d66dad1d25ada75d745d782f28d84e9ecfb85dfeb1f9c98 AS runtime
ARG VERSION="dev"
ARG COMMIT="none"
ARG DATE="unknown"

LABEL org.opencontainers.image.title="bitgauge" \
	org.opencontainers.image.description="Self-hosted, browser-based network speed test for LAN, homelab and VPN links" \
	org.opencontainers.image.source="https://github.com/leinardi/bitgauge" \
	org.opencontainers.image.version="${VERSION}" \
	org.opencontainers.image.revision="${COMMIT}" \
	org.opencontainers.image.created="${DATE}" \
	org.opencontainers.image.licenses="GPL-3.0-or-later"

COPY --from=build /out/bitgauge /bitgauge

# Spelled out rather than inherited: the base's default user is this same unprivileged identity,
# but the image's posture must not depend on a base image's default.
USER 65532:65532

EXPOSE 8080

# Exec form: there is no shell. The subcommand probes the server's own listen address
# (backend.md section 6).
HEALTHCHECK CMD ["/bitgauge", "healthcheck"]

ENTRYPOINT ["/bitgauge"]
