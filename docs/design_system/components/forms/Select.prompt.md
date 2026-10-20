Combobox button in the input shell; its listbox opens on demand (language, overhead presets, run-length unit).

```jsx
<Select icon="languages" aria-label="Language" options={['English']} style={{ width: 200 }} />
<Select aria-label="Run length unit" value={unit} onValueChange={setUnit} options={[{ value: 'm', label: 'minutes' }, { value: 'h', label: 'hours' }]} />
```
