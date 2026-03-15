#!/bin/bash
# Record an asciinema demo of RWA Nexus
# Usage: ./scripts/record-demo.sh

set -e

cd "$(dirname "$0")/.."

echo "Recording RWA Nexus demo..."

# Create a script for the demo
cat > /tmp/rwa-demo-script.sh << 'DEMO'
#!/bin/bash
set -e

# Typing effect
type_cmd() {
  echo -n "$ "
  for ((i=0; i<${#1}; i++)); do
    echo -n "${1:$i:1}"
    sleep 0.03
  done
  echo
  sleep 0.3
  eval "$1"
}

clear
echo "╔══════════════════════════════════════════════════════════╗"
echo "║        RWA Nexus — AI-Powered RWA Intelligence         ║"
echo "║        BNB Chain | Multi-Agent | MCP Server             ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo
sleep 2

echo "# Step 1: Run the test suite (1924 tests across 60 suites)"
sleep 1
type_cmd "npx jest --forceExit --silent 2>&1 | tail -5"
sleep 2

echo
echo "# Step 2: Run the multi-agent valuation demo"
sleep 1
type_cmd "npx ts-node examples/demo.ts 2>&1 | head -55"
sleep 3

echo
echo "# Step 3: Check the smart contracts"
sleep 1
type_cmd "npx hardhat compile 2>&1 | tail -5"
sleep 2

echo
echo "# 3 AI Agents × 3 Smart Contracts × 5 MCP Tools × 1924 Tests"
echo "# Built for BNB Chain RWA Demo Day"
echo
sleep 3
DEMO

chmod +x /tmp/rwa-demo-script.sh

# Record with asciinema
asciinema rec demo.cast \
  --command "bash /tmp/rwa-demo-script.sh" \
  --title "RWA Nexus Demo — AI-Powered Real World Asset Intelligence" \
  --idle-time-limit 3 \
  --overwrite

echo "Demo recorded to demo.cast"
echo "To replay: asciinema play demo.cast"
