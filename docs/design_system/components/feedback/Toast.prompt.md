Toast confirming a completed action ("Summary copied.", "Result deleted." + Undo).

```jsx
<Toast title="Summary copied." />
<Toast tone="info" icon="trash" title="Result deleted." message="It is removed when this message closes." action={<Button variant="ghost" size="sm">Undo</Button>} />
```
