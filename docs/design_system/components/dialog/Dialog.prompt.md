Modal for confirm (Clear all), compare, share and import results.

```jsx
<Dialog tone="danger" icon="trash" title="Clear all history?" scope="Export first to keep a copy."
  footer={<><Button variant="ghost">Cancel</Button><Button variant="danger-solid">Clear 47 results</Button></>}>
  This removes <b>47</b> results from this browser. It can't be undone.
</Dialog>
```
