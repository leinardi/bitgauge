/*
 * This file is part of BitGauge.
 *
 * Copyright (c) 2026 Roberto Leinardi
 *
 * BitGauge is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * BitGauge is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with BitGauge.  If not, see <http://www.gnu.org/licenses/>.
 */

package metrics

import (
	"fmt"
	"log/slog"
	"net/http"
	"strings"

	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// errorLog is promhttp's error log on slog: a failure to gather or encode the metrics is
// logged at warn, naming the error and nothing about the scraper.
type errorLog struct {
	log *slog.Logger
}

func (l errorLog) Println(values ...any) {
	l.log.Warn("metrics endpoint", slog.String("error", strings.TrimSpace(fmt.Sprintln(values...))))
}

// Handler serves the registry in the format the Accept header negotiates, OpenMetrics
// included, uncompressed; a failure to gather answers 500 (backend.md section 7). The router
// mounts it at metrics.path, for GET only, when metrics.enabled is set.
func (m *Metrics) Handler(log *slog.Logger) http.Handler {
	return promhttp.HandlerFor(m.registry, promhttp.HandlerOpts{
		ErrorLog:           errorLog{log: log},
		ErrorHandling:      promhttp.HTTPErrorOnError,
		DisableCompression: true,
		EnableOpenMetrics:  true,
	})
}
