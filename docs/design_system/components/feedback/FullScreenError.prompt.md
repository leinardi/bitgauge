Full-screen deployment error (base path mismatch).

```jsx
<FullScreenError title="The base path doesn't match this URL" facts={<MetaList rows={[{ label: 'Page path', value: '/speed/' }]} />}
  actions={<Button variant="primary" icon="refresh-cw">Reload</Button>}>
  This page was opened at <code className="ds-code">/speed/</code>, but the server is configured for <code className="ds-code">/</code>.
</FullScreenError>
```
