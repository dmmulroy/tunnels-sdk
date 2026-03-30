#!/bin/bash
# Fake cloudflared binary for testing expose() lifecycle.
# Outputs a trycloudflare URL to stderr (matching real cloudflared behavior),
# then stays alive until killed.

# Write URL to stderr after a tiny delay (simulates startup)
sleep 0.05
echo '{"level":"info","time":"2024-01-15T10:30:00Z","event":"tunnelConnection","message":"Registered tunnel connection connIndex=0 connection=abc123 location=DFW ip=1.2.3.4"}' >&2
echo 'https://test-tunnel-abc123.trycloudflare.com' >&2

# Write a PID file so the test can verify we're alive
echo $$ > /tmp/fake-cloudflared-$$.pid

# Stay alive until killed
while true; do
  sleep 1
done
