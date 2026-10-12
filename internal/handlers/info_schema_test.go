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

package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"os"
	"slices"
	"strconv"
	"strings"
	"testing"
	"time"

	"go.yaml.in/yaml/v3"

	"github.com/leinardi/bitgauge/internal/clientip"
	"github.com/leinardi/bitgauge/internal/config"
)

// schema is the part of an OpenAPI schema object these tests read.
type schema struct {
	Properties           map[string]*schema `yaml:"properties"`
	Items                *schema            `yaml:"items"`
	AdditionalProperties any                `yaml:"additionalProperties"`
	Ref                  string             `yaml:"$ref"`
	Required             []string           `yaml:"required"`
}

// contractSchemas reads components.schemas from api/openapi.yaml.
func contractSchemas(t *testing.T) map[string]*schema {
	t.Helper()

	data, err := os.ReadFile("../../api/openapi.yaml")
	if err != nil {
		t.Fatal(err)
	}

	var document struct {
		Components struct {
			Schemas map[string]*schema `yaml:"schemas"`
		} `yaml:"components"`
	}

	err = yaml.Unmarshal(data, &document)
	if err != nil {
		t.Fatal(err)
	}

	return document.Components.Schemas
}

// conforms checks value against the schema by shape: every required key present, no key the
// schema does not list where it allows no others, and the same for every nested object and
// array element. It is not a full JSON Schema validator; the handlers' own tests check values.
func conforms(t *testing.T, schemas map[string]*schema, node *schema, value any, at string) {
	t.Helper()

	if name, found := strings.CutPrefix(node.Ref, "#/components/schemas/"); found {
		resolved, known := schemas[name]
		if !known {
			t.Fatalf("%s: unknown schema %s", at, node.Ref)
		}

		node = resolved
	}

	if node.Items != nil {
		elements, _ := value.([]any)
		for index, element := range elements {
			conforms(t, schemas, node.Items, element, at+"["+strconv.Itoa(index)+"]")
		}

		return
	}

	if node.Properties == nil {
		return
	}

	object, isObject := value.(map[string]any)
	if !isObject {
		t.Fatalf("%s: %v is not an object", at, value)
	}

	for _, key := range node.Required {
		if _, present := object[key]; !present {
			t.Fatalf("%s: the handler omits the required key %s", at, key)
		}
	}

	for key, property := range object {
		propertySchema, listed := node.Properties[key]
		if !listed {
			if node.AdditionalProperties == false {
				t.Fatalf("%s: the handler sends %s, which the contract does not list", at, key)
			}

			continue
		}

		conforms(t, schemas, propertySchema, property, at+"."+key)
	}
}

// decode turns a handler's JSON body into generic values.
func decode(t *testing.T, body []byte) any {
	t.Helper()

	var value any

	err := json.Unmarshal(body, &value)
	if err != nil {
		t.Fatalf("body %s: %v", body, err)
	}

	return value
}

func TestInfoMatchesTheContract(t *testing.T) {
	t.Parallel()

	schemas := contractSchemas(t)

	// The contract lists exactly what the handler always sends: every property is required.
	for _, name := range []string{
		"Info", "InfoServer", "InfoClient", "InfoLimits", "TestDefaults",
		"DurationBounds", "CompatFlags", "UploadTelemetry",
	} {
		node := schemas[name]
		if node == nil {
			t.Fatalf("the contract has no schema %s", name)
		}

		for property := range node.Properties {
			if !slices.Contains(node.Required, property) {
				t.Fatalf("%s.%s is optional in the contract, but the handler always sends it",
					name, property)
			}
		}
	}

	deps := testDeps()
	defaults := &deps.Config.TestDefaults
	variants := []func(){
		func() {},
		func() {
			defaults.DataCap = 500 * config.MiB
			defaults.Warmup = config.Warmup{Duration: 3 * time.Second}
		},
	}

	for _, variant := range variants {
		variant()

		for _, client := range []string{"100.101.4.17", "203.0.113.9", "fd00::5"} {
			request := httptest.NewRequestWithContext(
				t.Context(),
				http.MethodGet,
				"/api/v1/info",
				nil,
			)
			request = request.WithContext(
				clientip.WithAddr(request.Context(), netip.MustParseAddr(client)))

			recorder := httptest.NewRecorder()
			Info(deps.Config, deps.Build, deps.Epoch)(recorder, request)

			conforms(t, schemas, schemas["Info"], decode(t, recorder.Body.Bytes()), "Info")
		}
	}
}

func TestUploadTelemetryMatchesTheContract(t *testing.T) {
	t.Parallel()

	schemas := contractSchemas(t)

	run := newUploadRun(exampleEntry,
		arrival{at: 50 * time.Millisecond, size: 100},
		arrival{at: 250 * time.Millisecond, size: 100},
	)
	run.serve(t, 200)

	conforms(t, schemas, schemas["UploadTelemetry"], decode(t, run.writer.body.Bytes()),
		"UploadTelemetry")

	telemetrySchema := schemas["UploadTelemetry"]
	if len(telemetrySchema.Properties) != 7 {
		t.Fatalf("the contract's UploadTelemetry has %d properties, want the seven of section 4",
			len(telemetrySchema.Properties))
	}
}

func TestErrorEnvelopeMatchesTheContract(t *testing.T) {
	t.Parallel()

	schemas := contractSchemas(t)

	for _, details := range []map[string]any{nil, {"max": 5}} {
		recorder := httptest.NewRecorder()
		WriteError(recorder, http.StatusBadRequest, CodeBytesOutOfRange, "out of range", details)

		conforms(t, schemas, schemas["Error"], decode(t, recorder.Body.Bytes()), "Error")
	}
}
