# 🔧 Troubleshooting Guide

This guide consolidates the debugging steps for the server, local agent, printers, and WSL networking.

## Quick Checklist

- [ ] Server process online (`pm2 list` on the server)
- [ ] Health check passes (`curl http://127.0.0.1:3000/api/print/health`)
- [ ] Local agent has connected once (`✅ 已连接到服务器` in agent log)
- [ ] Printer IP and port verified on site (`ping` / `telnet`)
- [ ] WSL networking script executed if the agent runs in WSL

## Server Side Debug

```bash
# Connect to the server
ssh kevin@90.195.120.165

# Check processes and status
pm2 list
curl http://127.0.0.1:3000/api/print/health | jq .
curl http://127.0.0.1:3000/api/print/agents | jq .

# Inspect logs
pm2 logs print-agent-server
pm2 logs print-agent-server --lines 50 --nostream
pm2 logs print-agent-server --err --lines 50
```

To send a manual test print from the server (requires an online agent):

```bash
curl -X POST \
  "http://127.0.0.1:3000/api/print?host=192.168.0.172&port=9100" \
  -H "Content-Type: application/octet-stream" \
  -H "X-Shop-Name: shop1" \
  --data-binary "测试打印"
```

## Local Agent Debug

```bash
cd ~/print-agent/agent
cat config.json
```

Confirm:
- `shopId` matches the value configured in the admin panel
- `serverUrl` uses the correct domain (`ws://printer1.easyify.uk/print-agent` or `ws://printer2.easyify.uk/print-agent`)

Start or restart the agent:

```bash
node local-print-agent.js
```

You should see log lines such as:

```
✅ 已连接到服务器
🔍 发送消息: register
```

If you enable the local status server, you can query:

```bash
curl http://127.0.0.1:<status-port>/status
```

### Useful Test Scripts

```bash
cd ~/print-agent
./test-local-agent.sh      # Runs the agent locally against the staging server
./test-print-remote.sh     # Sends a print job through the remote server
./test-print.sh            # Runs on the server against a specified printer
./test-print-now.sh <ip>   # Quick curl test for a single printer
```

## Printer Connectivity (EHOSTUNREACH, Timeout)

1. **Verify the printer IP** on the on-site PC:
   ```bash
   ip addr
   arp -a | grep 192.168.0
   ```

2. **Ping and port test**:
   ```bash
   ping 192.168.0.172
   nc -zv 192.168.0.172 9100   # or: telnet 192.168.0.172 9100
   ```

   - If ping fails: printer may be offline, wrong IP, or not on the same network.
   - If ping works but port test fails: confirm the printer uses raw port `9100` and no firewall blocks it.

3. **Confirm the printer is configured in the admin panel** with the same IP/port, or edit `agent/config.json`.

4. **Check Windows firewall** (on the host machine) if ports appear closed.

## WSL Networking Fixes

When the agent runs inside WSL and cannot reach printers while Windows can, apply one of the following:

```bash
# Recommended: run the bundled fix script
~/print-agent/fix-wsl-network.sh
```

Manual steps:

```bash
WINDOWS_HOST=$(ip route show | grep -i default | awk '{ print $3 }')
sudo ip route add 192.168.0.0/24 via $WINDOWS_HOST
ping -c 4 192.168.0.172
```

To persist the route, append the following to `~/.bashrc`:

```bash
WINDOWS_HOST=$(ip route show | grep -i default | awk '{ print $3 }')
sudo ip route add 192.168.0.0/24 via $WINDOWS_HOST 2>/dev/null || true
```

If the route still fails:
- Check Windows firewall rules
- Ensure the Windows NIC shares the same subnet (`192.168.0.x`)
- Consider running the agent directly on Windows instead of WSL

## Common Questions

- **Agent connects locally but not on site**: verify the site-specific printer IP and update both admin panel and `config.json`.
- **Print returns 503**: the agent is not connected or `X-Shop-Name` does not match `shopId`.
- **Need to inspect logs**: use `pm2 logs print-agent-server` on the server or observe the agent console output.

For more detailed scenarios, see `docs/deployment.md` and `docs/auto-start.md`.
