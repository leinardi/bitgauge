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

package config

import (
	"encoding"
	"errors"
	"fmt"
	"io/fs"
	"maps"
	"math"
	"net/netip"
	"os"
	"reflect"
	"slices"
	"strconv"
	"strings"

	"github.com/go-viper/mapstructure/v2"
	"github.com/knadh/koanf/parsers/yaml"
	"github.com/knadh/koanf/providers/env/v2"
	"github.com/knadh/koanf/providers/file"
	"github.com/knadh/koanf/providers/structs"
	"github.com/knadh/koanf/v2"
)

const (
	// EnvPrefix starts every environment variable BitGauge reads.
	EnvPrefix = "BITGAUGE_"
	// envNesting separates key levels in a variable name; single underscores stay in key names.
	envNesting = "__"
	// keyDelimiter separates key levels in koanf paths.
	keyDelimiter = "."
	// listSeparator splits a list value given in one environment variable.
	listSeparator = ","
	// labelSeparator splits a server.labels item of the environment into its cidr and label.
	labelSeparator = "="
	// structTag names the tag that maps Config fields to key paths.
	structTag = "koanf"
)

var (
	// ErrFileNotFound is returned when a configuration file given explicitly does not exist.
	ErrFileNotFound = errors.New("configuration file not found")
	// ErrFile is wrapped by a configuration file that cannot be read or is not valid YAML.
	ErrFile = errors.New("cannot read the configuration file")
	// ErrNumber is wrapped by a value that is not a number of the key's type.
	ErrNumber = errors.New("invalid number")
	// ErrBool is wrapped by a value that is not true or false.
	ErrBool = errors.New("invalid boolean")
	// ErrNull is wrapped by a key written without a value: a YAML null is neither a value of
	// the key's type nor "not set", so it is refused rather than read as a zero or a default.
	ErrNull = errors.New("key has no value")
	// ErrText is wrapped by a structured value given for a key that takes text, such as a map
	// for server.listen.
	ErrText = errors.New("expected text")
	// ErrLabelEntry is a server.labels entry given as text: in the file an entry is a {cidr,
	// label} map, and in the environment an item without "=" has no label.
	ErrLabelEntry = errors.New(
		"must be a {cidr, label} entry; in the environment each item is cidr=label")
)

// Loaded is the decoded configuration and what loading it noticed.
type Loaded struct {
	// Config holds every key that decoded; a key that did not keeps its default, so that
	// validation does not report it a second time under another rule.
	Config Config
	// Problems lists the keys that could not be decoded: unknown keys, nulls and values that
	// do not parse as their type. Any problem is fatal (configuration.md section 4).
	Problems []Problem
	// IgnoredEnv names the BITGAUGE_ variables that hold no "__" and are therefore not
	// configuration keys, such as Kubernetes service links (configuration.md section 4). The
	// caller logs them at debug; their values are never kept.
	IgnoredEnv []string
}

// Load reads the configuration from defaults, the YAML file at path and the process
// environment. explicit says whether path was given with --config: a missing file is an error
// then, and is skipped at the default path. The error is only for a file that cannot be read;
// keys that do not decode are listed in Loaded.Problems, and nothing is validated yet.
func Load(path string, explicit bool) (Loaded, error) {
	return LoadFrom(path, explicit, os.Environ())
}

// LoadFrom is Load with the environment given as KEY=value entries instead of read from the
// process, so tests can run in parallel.
func LoadFrom(path string, explicit bool, environ []string) (Loaded, error) {
	merged := koanf.New(keyDelimiter)

	err := merged.Load(structs.Provider(Defaults(), structTag), nil)
	if err != nil {
		return Loaded{}, fmt.Errorf("load the defaults: %w", err)
	}

	err = loadFile(merged, path, explicit)
	if err != nil {
		return Loaded{}, err
	}

	var loaded Loaded

	err = merged.Load(env.Provider(keyDelimiter, env.Opt{
		Prefix:        EnvPrefix,
		TransformFunc: envTransform(&loaded.IgnoredEnv),
		EnvironFunc:   func() []string { return environ },
	}), nil)
	if err != nil {
		return Loaded{}, fmt.Errorf("load the environment: %w", err)
	}

	loaded.Config = Defaults()
	// mapstructure skips a nil input and leaves the field as it was, so a null is reported here
	// rather than read as "not set".
	loaded.Problems = nullKeys(merged.Raw(), "")

	err = merged.UnmarshalWithConf("", &loaded.Config, koanf.UnmarshalConf{
		Tag: structTag,
		DecoderConfig: &mapstructure.DecoderConfig{
			// Unknown keys are not mapstructure's single summary error: unknownKeys collects
			// them below, one problem each.
			DecodeHook: decodeHook,
			// Keys match their field exactly: Server: or LISTEN in a file is a typo, not an
			// alias.
			MatchName: func(mapKey, fieldName string) bool { return mapKey == fieldName },
			Result:    &loaded.Config,
			TagName:   structTag,
		},
	})
	loaded.Problems = append(loaded.Problems, decodeProblems(err, merged.Raw())...)

	// mapstructure leaves Metadata.Unused empty for a struct that had a decode error, so an
	// unknown key beside a bad value in the same section is found by walking the raw keys.
	for _, key := range unknownKeys(merged.Raw(), reflect.TypeFor[Config](), "") {
		loaded.Problems = append(loaded.Problems, Problem{
			Key:   key,
			Value: displayValue(valueAt(merged.Raw(), key)),
			Rule:  "unknown key (configuration.md section 2 lists every key)",
		})
	}

	slices.SortStableFunc(loaded.Problems, func(left, right Problem) int {
		return strings.Compare(left.Key, right.Key)
	})
	slices.Sort(loaded.IgnoredEnv)

	return loaded, nil
}

// unknownKeys lists the keys of raw that match no koanf tag of section, recursing into the
// nested sections and into lists of them (server.labels[i]), in the key form of valueAt.
func unknownKeys(raw map[string]any, section reflect.Type, prefix string) []string {
	fields := sectionFields(section)

	var unknown []string

	for name, value := range raw {
		key := prefix + name

		field, known := fields[name]
		if !known {
			unknown = append(unknown, key)

			continue
		}

		unknown = append(unknown, unknownBelow(value, field, key)...)
	}

	return unknown
}

// unknownBelow lists the unknown keys under value, the raw value of a known field of type
// field at key.
func unknownBelow(value any, field reflect.Type, key string) []string {
	nested, isMap := value.(map[string]any)
	if isMap {
		if sectionFields(field) == nil {
			return nil
		}

		return unknownKeys(nested, field, key+keyDelimiter)
	}

	items := reflect.ValueOf(value)
	if field.Kind() != reflect.Slice || items.Kind() != reflect.Slice ||
		sectionFields(field.Elem()) == nil {
		return nil
	}

	var unknown []string

	for index := range items.Len() {
		entry, isEntry := reflect.TypeAssert[map[string]any](items.Index(index))
		if isEntry {
			unknown = append(unknown,
				unknownKeys(entry, field.Elem(), key+"["+strconv.Itoa(index)+"]"+keyDelimiter)...)
		}
	}

	return unknown
}

// sectionFields maps the koanf names of a struct's fields to their types, or is nil for a type
// that is not a section: a scalar, or a struct decoded from one (server.listen, warmup).
func sectionFields(section reflect.Type) map[string]reflect.Type {
	if section.Kind() != reflect.Struct {
		return nil
	}

	var fields map[string]reflect.Type

	for field := range section.Fields() {
		name, _, _ := strings.Cut(field.Tag.Get(structTag), ",")
		if name == "" {
			continue
		}

		if fields == nil {
			fields = make(map[string]reflect.Type, section.NumField())
		}

		fields[name] = field.Type
	}

	return fields
}

// decodeProblems turns mapstructure's joined errors into one problem per key.
func decodeProblems(err error, raw map[string]any) []Problem {
	if err == nil {
		return nil
	}

	joined, isJoined := err.(interface{ Unwrap() []error })
	if isJoined {
		var problems []Problem
		for _, inner := range joined.Unwrap() {
			problems = append(problems, decodeProblems(inner, raw)...)
		}

		return problems
	}

	// Matched directly, not with errors.AsType: Decode wraps its errors.Join result once, and
	// errors.AsType would find only the first DecodeError inside it.
	decodeErr, isDecodeErr := err.(*mapstructure.DecodeError)
	if isDecodeErr {
		return []Problem{{
			Key:   decodeErr.Name(),
			Value: displayValue(valueAt(raw, decodeErr.Name())),
			Rule:  ruleText(decodeErr.Unwrap()),
		}}
	}

	wrapped, isWrapped := err.(interface{ Unwrap() error })
	if isWrapped && wrapped.Unwrap() != nil {
		return decodeProblems(wrapped.Unwrap(), raw)
	}

	return []Problem{{Rule: ruleText(err)}}
}

// ruleText is the rule a value broke, from the error that rejected it.
func ruleText(err error) string {
	if err == nil {
		return "invalid value"
	}

	return err.Error()
}

// valueAt returns the raw value at a key path such as server.trusted_proxies[1].
func valueAt(raw map[string]any, key string) any {
	var current any = raw

	for part := range strings.SplitSeq(key, keyDelimiter) {
		name, index, hasIndex := strings.Cut(part, "[")

		object, isMap := current.(map[string]any)
		if !isMap {
			return nil
		}

		current = object[name]

		if hasIndex {
			current = elementAt(current, strings.TrimSuffix(index, "]"))
		}
	}

	return current
}

// elementAt indexes any slice: a file gives []any, while the environment provider splits a
// list into []string.
func elementAt(list any, index string) any {
	items := reflect.ValueOf(list)
	if items.Kind() != reflect.Slice {
		return nil
	}

	position, err := strconv.Atoi(index)
	if err != nil || position < 0 || position >= items.Len() {
		return nil
	}

	return items.Index(position).Interface()
}

// displayValue renders a raw value for a problem line. Configuration holds no secret
// (configuration.md section 4), so the value is shown as given.
func displayValue(value any) string {
	if value == nil {
		return "null"
	}

	text, isText := value.(string)
	if isText {
		return text
	}

	return fmt.Sprint(value)
}

func loadFile(merged *koanf.Koanf, path string, explicit bool) error {
	_, err := os.Stat(path)
	if errors.Is(err, fs.ErrNotExist) {
		if explicit {
			return fmt.Errorf("%w: %s", ErrFileNotFound, path)
		}

		return nil
	}

	if err != nil {
		return fmt.Errorf("%w %s: %w", ErrFile, path, err)
	}

	err = merged.Load(file.Provider(path), yaml.Parser())
	if err != nil {
		return fmt.Errorf("%w %s: %w", ErrFile, path, err)
	}

	return nil
}

// nullKeys returns a problem for every key, or list element, that holds a YAML null.
func nullKeys(value any, path string) []Problem {
	switch typed := value.(type) {
	case nil:
		return []Problem{
			{Key: path, Value: "null", Rule: ErrNull.Error() + ": write a value or remove the key"},
		}
	case map[string]any:
		var found []Problem

		for _, key := range slices.Sorted(maps.Keys(typed)) {
			child := key
			if path != "" {
				child = path + keyDelimiter + key
			}

			found = append(found, nullKeys(typed[key], child)...)
		}

		return found
	case []any:
		var found []Problem

		for index, item := range typed {
			found = append(found, nullKeys(item, fmt.Sprintf("%s[%d]", path, index))...)
		}

		return found
	default:
		return nil
	}
}

// envTransform maps BITGAUGE_SERVER__TRUSTED_PROXIES to server.trusted_proxies, splits the
// value of a list key on commas, and records variables without "__" as ignored. A server.labels
// item is split at its first "=" into a {cidr, label} entry; an item without "=" stays text,
// which decoding refuses (ErrLabelEntry), so it is a problem and never dropped.
func envTransform(ignored *[]string) func(name, value string) (string, any) {
	lists := listKeys(reflect.TypeFor[Config](), "")

	return func(name, value string) (string, any) {
		rest := strings.TrimPrefix(name, EnvPrefix)
		if !strings.Contains(rest, envNesting) {
			*ignored = append(*ignored, name)

			return "", nil
		}

		key := strings.ToLower(strings.ReplaceAll(rest, envNesting, keyDelimiter))

		element, isList := lists[key]
		if !isList {
			return key, value
		}

		if value == "" {
			return key, []string{}
		}

		items := strings.Split(value, listSeparator)
		for index := range items {
			items[index] = strings.TrimSpace(items[index])
		}

		if element == labelRuleType {
			return key, labelEntries(items)
		}

		return key, items
	}
}

// labelEntries turns the environment's cidr=label items into the entries a file would hold.
func labelEntries(items []string) []any {
	entries := make([]any, 0, len(items))

	for _, item := range items {
		cidr, label, found := strings.Cut(item, labelSeparator)
		if !found {
			entries = append(entries, item)

			continue
		}

		entries = append(entries, map[string]any{
			"cidr":  strings.TrimSpace(cidr),
			"label": strings.TrimSpace(label),
		})
	}

	return entries
}

// listKeys returns the key paths of every slice-typed field with its element type, so that the
// comma rule follows the struct instead of a hand-kept list.
func listKeys(structType reflect.Type, parent string) map[string]reflect.Type {
	keys := map[string]reflect.Type{}

	for field := range structType.Fields() {
		name, _, _ := strings.Cut(field.Tag.Get(structTag), ",")
		if name == "" {
			continue
		}

		path := name
		if parent != "" {
			path = parent + keyDelimiter + name
		}

		if field.Type.Kind() == reflect.Slice {
			keys[path] = field.Type.Elem()
		}

		if field.Type.Kind() == reflect.Struct {
			maps.Copy(keys, listKeys(field.Type, path))
		}
	}

	return keys
}

var (
	labelRuleType       = reflect.TypeFor[LabelRule]()
	prefixType          = reflect.TypeFor[netip.Prefix]()
	sizeType            = reflect.TypeFor[Size]()
	textUnmarshalerType = reflect.TypeFor[encoding.TextUnmarshaler]()
)

// decodeHook converts the values koanf collected into the field types strictly. It replaces
// mapstructure's weak typing, which would truncate 8.5 to 8, read "1" as true and accept a CIDR
// without its prefix length.
func decodeHook(source, target reflect.Type, data any) (any, error) {
	number, isFloat := data.(float64)
	if isFloat && !isFinite(number) {
		return nil, fmt.Errorf("%w: %v is not a finite number", ErrNumber, number)
	}

	if source == target {
		return data, nil
	}

	text, isText := data.(string)
	if !isText {
		return convertNonText(data, target)
	}

	if target == labelRuleType {
		return nil, fmt.Errorf("%w: %q", ErrLabelEntry, text)
	}

	if target == prefixType {
		prefix, err := netip.ParsePrefix(text)
		if err != nil {
			return nil, fmt.Errorf("%w: %w", ErrPrefix, err)
		}

		return prefix, nil
	}

	value := reflect.New(target)

	unmarshaler, isUnmarshaler := reflect.TypeAssert[encoding.TextUnmarshaler](value)
	if isUnmarshaler {
		err := unmarshaler.UnmarshalText([]byte(text))
		if err != nil {
			return nil, fmt.Errorf("decode %s: %w", target.Name(), err)
		}

		return value.Elem().Interface(), nil
	}

	return parseScalar(text, target)
}

// convertNonText handles a value that is not a string. A key whose type parses text (a CIDR, an
// address, a duration, a warm-up) takes text only: decoding a map into it would expose the Go
// fields as undocumented keys. Size is the one such type that also takes a YAML number.
func convertNonText(data any, target reflect.Type) (any, error) {
	if target != sizeType && reflect.PointerTo(target).Implements(textUnmarshalerType) {
		return nil, fmt.Errorf("%w: %v", ErrText, data)
	}

	return convertNumber(data, target)
}

func isIntegerKind(kind reflect.Kind) bool {
	return kind == reflect.Int || kind == reflect.Int64
}

// parseScalar parses an environment string (or a quoted YAML scalar) into an int, float or bool
// field; any other target is left to mapstructure.
func parseScalar(text string, target reflect.Type) (any, error) {
	kind := target.Kind()

	if isIntegerKind(kind) {
		number, err := strconv.ParseInt(text, 10, 64)
		if err != nil {
			return nil, fmt.Errorf("%w: %q", ErrNumber, text)
		}

		return number, nil
	}

	if kind == reflect.Float64 {
		number, err := strconv.ParseFloat(text, 64)
		if err != nil || !isFinite(number) {
			return nil, fmt.Errorf("%w: %q", ErrNumber, text)
		}

		return number, nil
	}

	if kind == reflect.Bool {
		// Only the two words YAML itself uses; strconv.ParseBool would also take 1, t and F.
		switch text {
		case "true":
			return true, nil
		case "false":
			return false, nil
		default:
			return nil, fmt.Errorf("%w: %q (want true or false)", ErrBool, text)
		}
	}

	return text, nil
}

// convertNumber turns a YAML number into a Size or an integer only when it is whole, and a Size
// only when it is not negative.
func convertNumber(data any, target reflect.Type) (any, error) {
	isInteger := isIntegerKind(target.Kind())

	switch number := data.(type) {
	case int:
		if target == sizeType && number < 0 {
			return nil, fmt.Errorf("%w: %d is negative", ErrSize, number)
		}

		return data, nil
	case uint64:
		if isInteger && number > math.MaxInt64 {
			return nil, fmt.Errorf("%w: %d is too large", ErrNumber, number)
		}

		return data, nil
	case float64:
		if target == sizeType {
			return sizeFromNumber(number)
		}

		if isInteger && (number != math.Trunc(number) || math.Abs(number) >= math.MaxInt64) {
			return nil, fmt.Errorf("%w: %v is not a whole number", ErrNumber, number)
		}

		return data, nil
	default:
		return data, nil
	}
}

func isFinite(number float64) bool {
	return !math.IsNaN(number) && !math.IsInf(number, 0)
}
