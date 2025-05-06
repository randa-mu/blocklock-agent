# blocklock-agent

[![Build Status](https://github.com/randa-mu/blocklock-agent/actions/workflows/build.yml/badge.svg)](https://github.com/randa-mu/blocklock-agent/actions/workflows/build.yml)

`blocklock-agent` is a blockchain-based timelock decryption and signature agent that uses BLS cryptography and the Blocklock protocol on the Ethereum-compatible Filecoin network. It listens for on-chain `DecryptionRequested` events and responds based on cryptographic criteria.

> **Note**: You **do not need to run your own node**. The [**dcipher network**](https://docs.randa.mu) operates trusted `blocklock-agent` instances on supported chains, and can fulfill requests on your behalf.

> If you want to run your own agent in **production**, you must:
> - Use your own **BLS private key** (do _not_ reuse any defaults!)
> - Deploy the required smart contracts from [**blocklock-solidity**](https://github.com/randa-mu/blocklock-solidity)
> - Pass your BLS **public key** to the deployed contracts so they can verify your agent’s responses.

---

## Features

- 🔁 **Event Listener**: Watches for `DecryptionRequested` events from the `DecryptionSender` contract.
- 🔐 **BLS Signatures**: Signs request conditions using BLS cryptography.
- 🧠 **IBE Integration**: Decrypts messages using identity-based encryption.
- ⚙️ **State Persistence**: Persists last processed block and request ID to disk.
- 📡 **Health Endpoint**: Exposes HTTP endpoint for readiness/health probes.
- 🔄 **Event Replay**: Replays unfulfilled past requests upon restart.
- 🧮 **Rate Limiting**: Limits the number of requests fulfilled per block.

---

## Requirements

- Node.js v16+
- Access to a deployed `DecryptionSender` contract
- Connection to a blockchain node (e.g., Filecoin Calibration or mainnet)

---

## Installation

```bash
git clone <repository-url>
cd blocklock-agent
npm install
```

---

## Configuration

You can configure `blocklock-agent` using CLI flags or environment variables:

| CLI Flag                     | Env Var                                           | Default                                         | Description                                                                                          |
|-----------------------------|---------------------------------------------------|-------------------------------------------------|------------------------------------------------------------------------------------------------------|
| `--port`                    | `BLOCKLOCK_PORT`                                  | `8080`                                          | HTTP port for health checks                                                                         |
| `--rpc-url`                 | `BLOCKLOCK_RPC_URL`                               | `https://api.calibration.node.glif.io/rpc/v1`   | Ethereum-compatible RPC or WebSocket endpoint                                                       |
| `--private-key`             | `BLOCKLOCK_PRIVATE_KEY`                           | _default private key_                           | Private key for signing and contract interaction                                                    |
| `--bls-key`                 | `BLOCKLOCK_BLS_PRIVATE_KEY`                       | _default BLS key_                               | BLS private key used to sign request conditions                                                     |
| `--decryption-sender-addr` | `BLOCKLOCK_DECRYPTION_SENDER_CONTRACT_ADDRESS`    | _deployed contract address_                     | Address of the deployed `DecryptionSender` smart contract                                            |
| `--polling-interval`        | `BLOCKLOCK_POLLING_INTERVAL`                      | `1000` (ms)                                     | How frequently to poll the blockchain for events                                                    |
| `--log-level`               | `BLOCKLOCK_LOG_LEVEL`                             | `info`                                          | Log verbosity: `info`, `debug`, `error`, `trace`                                                    |
| `--state-path`              | `BLOCKLOCK_STATE_PATH`                            | `./state.json`                                  | File path to store last processed block height and request ID                                       |
| `--rate-limit`              | `BLOCKLOCK_RATE_LIMIT`                            | _implementation-defined default_                | Maximum number of requests to fulfill per block                                                     |

---

## Usage

Run the agent:

```bash
npm run start [options]
```

Example:

```bash
npm run start \
  --rpc-url http://localhost:8545 \
  --state-path ./state.json \
  --rate-limit 3
```

If no state file exists, the agent begins at the current block height. A sample state file format is:

```json
{ "chainHeight": 123456 }
```

---

## How It Works

1. **Startup**:
   - Connects to the blockchain using the configured RPC
   - Loads cryptographic keys and config
   - Reads `state.json` to determine where to resume processing
   - Queries past `DecryptionRequested` events from the last known block
   - Begins polling for new events

2. **Decryption Handling**:
   - For each request:
     - Verifies that the scheme is supported (`BN254-BLS-BLOCKLOCK`)
     - Computes a BLS signature over the request condition
     - Submits a fulfillment via `DecryptionSender`

3. **State Persistence**:
   - Saves the latest processed block height and request ID to `state.json` to ensure replay safety

4. **Health Endpoint**:
   - HTTP server responds on the configured port to report liveness/health

5. **Rate Limiting**:
   - Ensures that only a limited number of requests are fulfilled per block (useful for gas control)

---

## Development

```bash
npm run build
```

---

## Directory Structure

- `crypto/` – Core cryptographic logic for BLS and IBE
- `generated/` – Auto-generated contract bindings (TypeChain)
- `provider.ts` – Blockchain connection utilities
- `index.ts` – Application entry point

---

## Testing

To test locally:

1. Start a local chain like [Anvil](https://book.getfoundry.sh/reference/anvil/)
2. Deploy `DecryptionSender`, `BlocklockSender`, and any relevant user contracts
3. Emit `DecryptionRequested` events to simulate activity

See [blocklock-solidity](https://github.com/randa-mu/blocklock-solidity) for contract setup and example scripts.

---

## Troubleshooting

- **`missing revert data`**:
  - Check the RPC URL, private key, contract address, and ciphertext validity
  - Refer to this [example script](https://github.com/randa-mu/blocklock-solidity/blob/main/scripts/chain-interaction.ts)

- **Unhandled Exception**:
  - Ensure the blockchain node is accessible
  - Confirm that the start block exists and the chain isn’t pruned

---

## Contributing

Pull requests and issues are welcome. Help us make `blocklock-agent` better!

---

## Acknowledgements

💙 **Special thanks to the [Filecoin Foundation](https://fil.org)** for funding this work.

---

## License

MIT — see [LICENSE](./LICENSE)

