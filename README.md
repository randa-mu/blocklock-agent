## @randamu/blocklock-agent

The `blocklock-agent` is a blockchain-based timelock decryption and signature agent leveraging BLS signatures and blocklock mechanisms on the Ethereum-compatible Filecoin network. This agent listens for decryption requests and processes them based on predefined conditions.

### Features

- **Event Listener**: Listens for `DecryptionRequested` events from the `DecryptionSender` smart contract.
- **BLS Cryptography**: Utilizes BLS signatures for secure and efficient cryptographic operations.
- **IBE Decryption**: Implements identity-based encryption (IBE) to handle requests securely.
- **Health Check**: Provides an HTTP health-check endpoint.
- **Event Replay**: Replays past unfulfilled decryption requests upon startup.

### Requirements

- Node.js version 16+.
- An Ethereum-compatible blockchain node (e.g., Filecoin calibration network).
- Access to the deployed `DecryptionSender` contract address.

### Installation

1. Clone the repository:
    ```bash
    git clone <repository-url>
    cd blocklock-agent
    ```

2. Install dependencies:
    ```bash
    npm install
    ```

### Configuration

The agent can be configured using command-line arguments, environment variables, or a combination of both. Below are the available options:

| Option                   | Default Value                                 | Environment Variable                           | Description                                                                                                        |
|--------------------------|-----------------------------------------------|------------------------------------------------|--------------------------------------------------------------------------------------------------------------------|
| `--port`                 | `8080`                                        | `BLOCKLOCK_PORT`                               | The port to host the health-check HTTP server.                                                                     |
| `--rpc-url`              | `https://api.calibration.node.glif.io/rpc/v1` | `BLOCKLOCK_RPC_URL`                            | Blockchain RPC URL.                                                                                                |
| `--private-key`          | `<Default Private Key>`                       | `BLOCKLOCK_PRIVATE_KEY`                        | Private key for transaction signing.                                                                               |
| `--bls-key`              | `<Default BLS Key>`                           | `BLOCKLOCK_BLS_PRIVATE_KEY`                    | BLS private key for signing.                                                                                       |
| `--decryptionSenderAddr` | `<Deployed Contract Address>`                 | `BLOCKLOCK_DECRYPTION_SENDER_CONTRACT_ADDRESS` | Address of the deployed `DecryptionSender` contract.                                                               |
| `--state-path`           | `./state.json`                                | `BLOCKLOCK_STATE_PATH`                         | A JSON file containing the `chainHeight` at which to start processing events. Empty will start from current block. |
| `--polling-interval`     | 1000                                          | `BLOCKLOCK_POLLING_INTERVAL`                   | How frequently in milliseconds to call the RPC for the latest events/state.                                        |
| `--log-level`            | info                                          | `BLOCKLOCK_LOG_LEVEL`                          | The logging level for structured JSON logging. Can be "info", "debug", "error", or "trace".                        |

### Usage

To start the `blocklock-agent`, run the following command:

```bash
npm run start [options]
```

For example, to specify a custom RPC URL and state file, run:

```bash
npm run start --rpc-url http://localhost:8545 --state-file /home/cooluser/state.json
```

The agent will store its state periodically to the provided state file. If a state file doesn't exist, it will start from the current chain height.
If you wish to bootstrap it with a custom state file, an example format is the following:
```{ "chainHeight": 123456 }```

### How It Works

1. **Initialization**:
   - Connects to the specified RPC URL.
   - Configures the agent with the provided private and BLS keys.
   - Loads the state file to determine which chain height to start from, 
   - Retrieves past `DecryptionRequested` events from the `chainHeight` specified in the state file
   - Listens for future `DecryptionRequested` events

2. **Event Processing**:
   - For each `DecryptionRequested` event:
     - Verifies the scheme ID (`BN254-BLS-BLOCKLOCK`).
     - Computes the BLS signature for the request condition.
     - Processes the ciphertext and fulfills the request via the `DecryptionSender` contract.

3. **Health Check**:
   - Hosts a lightweight HTTP server on the configured port to indicate the agent's health.

4. **Keep Alive**:
   - The agent remains active, continuously listening for new events and processing them in real-time.

### Development

#### Scripts

- Build the project:
    ```bash
    npm run build
    ```

### Directory Structure

- **`crypto/`**: Contains cryptographic implementations (BLS and IBE).
- **`generated/`**: Auto-generated smart contract TypeScript bindings / factories and type definitions.
- **`provider.ts`**: Utilities for blockchain provider creation and retry logic.
- **`index.ts`**: Entry point of the application.

### Testing

To test the agent, you can simulate `DecryptionRequested` events on a local blockchain, e.g., [Anvil](https://book.getfoundry.sh/reference/anvil/).
Note that the required smart contracts will need to be deployed on the local chain, i.e., DecryptionSender, BlocklockSender and the user contract from where the on-chain timelock encryption / decryption requests will be made.
See the [blocklock-solidity repository](github.com/randa-mu/blocklock-solidity.git) for more.

### Troubleshooting

- **Error: `missing revert data`**:
  Ensure the contract address, private key, and RPC URL are correctly configured. Ensure that the Ciphertext is correctly generated. There's an example [here](github.com/randa-mu/blocklock-solidity/blob/main/scripts/chain-interaction.ts)
  
- **Unhandled Exception**:
  Check the blockchain node for connectivity issues or misconfigured start block.

### Contributing

Contributions are welcome! Please submit issues or pull requests to improve the project.

### License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
