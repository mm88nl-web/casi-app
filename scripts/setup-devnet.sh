#!/usr/bin/env bash
#
# setup-devnet.sh
#
# One-shot bootstrap for Ubuntu: installs the Solana toolchain (Rust, Solana
# CLI, Anchor 0.30.1 via avm), builds the CASI escrow program, runs the local
# test suite, and deploys to devnet. Safe to re-run — every step is idempotent.
#
# Usage (from repo root):
#   chmod +x scripts/setup-devnet.sh
#   ./scripts/setup-devnet.sh
#
# Optional flags:
#   --skip-airdrop    Don't request devnet SOL (use if you already have some)
#   --skip-test       Skip `anchor test` (deploy anyway)
#   --skip-deploy     Build + test only; don't deploy to devnet
#

set -euo pipefail

# --- config --------------------------------------------------------------
ANCHOR_VERSION="0.30.1"
SOLANA_VERSION="stable"
NODE_MIN_MAJOR=20
MIN_DEVNET_SOL=3            # ask for airdrop until balance >= this
AIRDROP_CHUNK=2             # devnet faucet caps per-request
AIRDROP_MAX_TRIES=6

SKIP_AIRDROP=0
SKIP_TEST=0
SKIP_DEPLOY=0
for arg in "$@"; do
  case "$arg" in
    --skip-airdrop) SKIP_AIRDROP=1 ;;
    --skip-test)    SKIP_TEST=1 ;;
    --skip-deploy)  SKIP_DEPLOY=1 ;;
    -h|--help)
      sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# --- helpers -------------------------------------------------------------
c_reset="\033[0m"; c_bold="\033[1m"; c_blue="\033[34m"; c_green="\033[32m"; c_yellow="\033[33m"; c_red="\033[31m"

step() { printf "\n${c_bold}${c_blue}==>${c_reset} ${c_bold}%s${c_reset}\n" "$1"; }
ok()   { printf "    ${c_green}✓${c_reset} %s\n" "$1"; }
warn() { printf "    ${c_yellow}⚠${c_reset} %s\n" "$1"; }
die()  { printf "\n${c_red}✖ %s${c_reset}\n" "$1" >&2; exit 1; }

have() { command -v "$1" >/dev/null 2>&1; }

# Source cargo + solana into this shell after install, if not already on PATH
ensure_path() {
  if [ -f "$HOME/.cargo/env" ]; then . "$HOME/.cargo/env"; fi
  local sol="$HOME/.local/share/solana/install/active_release/bin"
  case ":$PATH:" in
    *":$sol:"*) ;;
    *) if [ -d "$sol" ]; then export PATH="$sol:$PATH"; fi ;;
  esac
  local avm="$HOME/.avm/bin"
  case ":$PATH:" in
    *":$avm:"*) ;;
    *) if [ -d "$avm" ]; then export PATH="$avm:$PATH"; fi ;;
  esac
  return 0
}
ensure_path

# --- 0. sanity checks ----------------------------------------------------
step "Checking prerequisites"

[ "$(uname -s)" = "Linux" ] || warn "This script targets Ubuntu/Linux. Proceeding anyway."

if ! have node; then
  die "Node.js not found. Install Node $NODE_MIN_MAJOR+ (https://nodejs.org/) and re-run."
fi
node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" -lt "$NODE_MIN_MAJOR" ]; then
  die "Node $node_major detected; need $NODE_MIN_MAJOR or newer."
fi
ok "Node $(node -v)"

if ! have curl; then die "curl is required. sudo apt install -y curl"; fi
if ! have git;  then die "git is required. sudo apt install -y git"; fi
ok "curl + git present"

# Build-essentials are needed for cargo/anchor. Check for cc; nudge user if missing.
if ! have cc; then
  warn "C compiler not found. Installing build-essential (requires sudo)..."
  sudo apt-get update -y
  sudo apt-get install -y build-essential pkg-config libssl-dev libudev-dev
fi
ok "build toolchain present"

# --- 1. Rust -------------------------------------------------------------
step "Installing Rust toolchain"
if have rustc && have cargo; then
  ok "rustc $(rustc --version | awk '{print $2}') already installed"
else
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
  ensure_path
  have rustc || die "Rust install failed."
  ok "rustc $(rustc --version | awk '{print $2}') installed"
fi

# --- 2. Solana CLI -------------------------------------------------------
step "Installing Solana CLI"
if have solana; then
  ok "solana $(solana --version | awk '{print $2}') already installed"
else
  sh -c "$(curl -sSfL https://release.anza.xyz/$SOLANA_VERSION/install)"
  ensure_path
  have solana || die "Solana install failed. Add \$HOME/.local/share/solana/install/active_release/bin to PATH."
  ok "solana $(solana --version | awk '{print $2}') installed"
fi

# --- 3. Anchor (via avm) -------------------------------------------------
step "Installing Anchor $ANCHOR_VERSION"
if ! have avm; then
  cargo install --git https://github.com/coral-xyz/anchor avm --force
  ensure_path
  have avm || die "avm install failed."
fi
if avm list 2>/dev/null | grep -q "^${ANCHOR_VERSION}"; then
  ok "avm has anchor $ANCHOR_VERSION"
else
  avm install "$ANCHOR_VERSION"
fi
avm use "$ANCHOR_VERSION" >/dev/null
have anchor || die "anchor not on PATH after avm install."
current_anchor="$(anchor --version | awk '{print $2}')"
[ "$current_anchor" = "$ANCHOR_VERSION" ] || warn "anchor --version reports $current_anchor (expected $ANCHOR_VERSION)"
ok "anchor $current_anchor"

# --- 4. Wallet + cluster -------------------------------------------------
step "Configuring Solana wallet + cluster"
WALLET="$HOME/.config/solana/id.json"
if [ ! -f "$WALLET" ]; then
  mkdir -p "$(dirname "$WALLET")"
  solana-keygen new --no-bip39-passphrase -s -o "$WALLET"
  ok "generated new devnet keypair at $WALLET"
else
  ok "wallet already exists at $WALLET"
fi
solana config set --keypair "$WALLET"   >/dev/null
solana config set --url    devnet        >/dev/null
WALLET_PUBKEY="$(solana address)"
ok "wallet pubkey: $WALLET_PUBKEY"

# --- 5. Airdrop ----------------------------------------------------------
if [ "$SKIP_AIRDROP" -eq 1 ]; then
  step "Skipping airdrop (--skip-airdrop)"
else
  step "Funding devnet wallet"
  tries=0
  while :; do
    # `solana balance` prints e.g. "5.123456789 SOL"
    bal="$(solana balance 2>/dev/null | awk '{print $1}')"
    [ -z "$bal" ] && bal=0
    bal_int="${bal%%.*}"
    [ -z "$bal_int" ] && bal_int=0
    if [ "$bal_int" -ge "$MIN_DEVNET_SOL" ]; then
      ok "balance: $bal SOL (>= $MIN_DEVNET_SOL)"
      break
    fi
    tries=$((tries+1))
    if [ "$tries" -gt "$AIRDROP_MAX_TRIES" ]; then
      warn "airdrop retries exhausted; current balance $bal SOL. You may need to use https://faucet.solana.com manually."
      break
    fi
    echo "    airdrop attempt $tries/$AIRDROP_MAX_TRIES (current: $bal SOL)"
    if ! solana airdrop "$AIRDROP_CHUNK" 2>/dev/null; then
      warn "airdrop rate-limited, sleeping 15s..."
      sleep 15
    fi
  done
fi

# --- 6. npm install ------------------------------------------------------
step "Installing npm dependencies"
if [ ! -d node_modules ] || [ package.json -nt node_modules ]; then
  npm install
else
  ok "node_modules up-to-date (delete to force reinstall)"
fi

# --- 7. First build (generates IDL + keypair) ----------------------------
step "Building Anchor program (pass 1 — generates keypair)"
anchor build
ok "built (target/deploy/casi_escrow-keypair.json generated)"

# --- 8. Sync declare_id + Anchor.toml + .env.local -----------------------
step "Syncing program ID into lib.rs / Anchor.toml / .env.local"
node scripts/sync-program-id.mjs

# --- 9. Second build with correct declare_id! ----------------------------
step "Building Anchor program (pass 2 — with real program ID)"
anchor build
ok "built"

# --- 10. Local tests -----------------------------------------------------
if [ "$SKIP_TEST" -eq 1 ]; then
  step "Skipping tests (--skip-test)"
else
  step "Running test suite (spins up local validator)"
  if anchor test; then
    ok "all tests passed"
  else
    die "tests failed. Fix before deploying to devnet, or re-run with --skip-test to override."
  fi
fi

# --- 11. Deploy to devnet ------------------------------------------------
if [ "$SKIP_DEPLOY" -eq 1 ]; then
  step "Skipping deploy (--skip-deploy)"
else
  step "Deploying to devnet"
  anchor deploy --provider.cluster devnet
  ok "deployed"
  # Re-sync in case the deployed program ID differs from the IDL placeholder.
  node scripts/sync-program-id.mjs
fi

# --- 12. Summary ---------------------------------------------------------
PROGRAM_ID="$(node -e "console.log(JSON.parse(require('fs').readFileSync('target/idl/casi_escrow.json','utf8')).address || '')")"

printf "\n${c_bold}${c_green}All done.${c_reset}\n"
printf "  program id : ${c_bold}%s${c_reset}\n" "${PROGRAM_ID:-<not found>}"
printf "  wallet     : %s\n" "$WALLET_PUBKEY"
printf "  cluster    : devnet\n\n"
printf "${c_bold}Next steps:${c_reset}\n"
printf "  1. Verify ${c_bold}NEXT_PUBLIC_CASI_PROGRAM_ID${c_reset} in .env.local matches the id above.\n"
printf "  2. Copy the Vercel env-var checklist printed by sync-program-id.mjs into your Vercel project settings.\n"
printf "  3. Run ${c_bold}npm run dev${c_reset} locally to test the frontend against devnet.\n"
printf "  4. When ready for mainnet: re-run with a funded mainnet wallet and edit Anchor.toml.\n\n"
