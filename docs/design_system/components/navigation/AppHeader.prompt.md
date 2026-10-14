Persistent app header and narrow-layout tab bar — pass server, host, status and the scoped nav items.

```jsx
const items = [{ key: 'test', label: 'Test', icon: 'gauge' }, { key: 'about', label: 'About', icon: 'info' }];
<AppHeader server="Basement NAS" host="speed.home.lan" status="connected" items={items} active="test" theme="dark" />
<AppHeader server={null} host="speed.home.lan" status="unreachable" items={items} active="test" />
<AppHeader compact server="Basement NAS" host="speed.home.lan" />
<TabBar items={items} active="test" />
```
