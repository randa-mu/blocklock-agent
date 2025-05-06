import {Command, Option} from "commander"
import {
    NonceManager,
    AbstractProvider,
    Wallet,
    BigNumberish,
    AddressLike,
} from "ethers"
import {keccak_256} from "@noble/hashes/sha3"
import winston from "winston"
import {Fr} from "mcl-wasm"

import {type DecryptionSender, DecryptionSender__factory} from "./generated"
import {BlsBn254} from "./crypto/bls-bn254"
import {IbeOpts, preprocess_decryption_key_g1,} from "./crypto/ibe-bn254"
import {createProviderWithRetry} from "./provider"
import {encode, parseSolidityCiphertext, signatureForChainHeight} from "./signing"
import {extractErrorMessage} from "./ethers-util"
import {groupBy, keepAlive, min, startApiServer} from "./util"
import {TypesLib} from "./generated/DecryptionSender"
import {
    reportDecryptionSuccessful,
    reportDecryptionError,
    reportChainHeight
} from "./metrics"

const program = new Command()
const defaultPort = "8080"
const defaultRPC = "https://api.calibration.node.glif.io/rpc/v1"
const defaultPrivateKey = "0x00a7de6fec3e1660ddf532e37283a125cb3017603e6f0f5fe0ffddc4f64bf684"
const defaultBlsKey = "0x58aabbe98959c4dcb96c44c53be7e3bb980791fc7a9e03445c4af612a45ac906"
const defaultDecryptionSenderAddr = "0x9297Bb1d423ef7386C8b2e6B7BdE377977FBedd3"
const defaultPollingInterval = 1000 // milliseconds
const defaultLogLevel = "info"
const defaultStatePath = "./state.json"
const defaultRateLimit = Infinity

export type Signing = {
    bls: BlsBn254,
    blsSecretKey: Fr
}

export const BLOCKLOCK_IBE_OPTS: IbeOpts = {
    hash: keccak_256,
    k: 128,
    expand_fn: "xmd",
    dsts: {
        H1_G1: Buffer.from("BLOCKLOCK_BN254G1_XMD:KECCAK-256_SVDW_RO_H1_"),
        H2: Buffer.from("BLOCKLOCK_BN254_XMD:KECCAK-256_H2_"),
        H3: Buffer.from("BLOCKLOCK_BN254_XMD:KECCAK-256_H3_"),
        H4: Buffer.from("BLOCKLOCK_BN254_XMD:KECCAK-256_H4_"),
    }
}

program
    .addOption(new Option("--port <port>", "The port to host the healthcheck on")
        .default(defaultPort)
        .env("BLOCKLOCK_PORT")
    )
    .addOption(new Option("--rpc-url <rpc-url>", "The websockets/HTTP URL to connect to the blockchain from")
        .default(defaultRPC)
        .env("BLOCKLOCK_RPC_URL")
    )
    .addOption(new Option("--private-key <private-key>", "The private key to use for execution")
        .default(defaultPrivateKey)
        .env("BLOCKLOCK_PRIVATE_KEY")
    )
    .addOption(new Option("--bls-key <bls-key>", "The BLS private key to use for signing")
        .default(defaultBlsKey)
        .env("BLOCKLOCK_BLS_PRIVATE_KEY")
    )
    .addOption(new Option("--decryption-sender-addr <decryption-sender-addr>", "The contract address of the deployed decryption sender smart contract instance")
        .default(defaultDecryptionSenderAddr)
        .env("BLOCKLOCK_DECRYPTION_SENDER_CONTRACT_ADDRESS")
    )
    .addOption(new Option("--polling-interval <time-milliseconds>", "How often the RPC should be polled")
        .default(defaultPollingInterval)
        .env("BLOCKLOCK_POLLING_INTERVAL")
    )
    .addOption(new Option("--log-level <level>", "info | debug | trace | error")
        .default(defaultLogLevel)
        .env("BLOCKLOCK_LOG_LEVEL")
    )
    .addOption(new Option("--state-path <filepath>", "the path to store the last fulfilled block/requestId")
        .default(defaultStatePath)
        .env("BLOCKLOCK_STATE_PATH")
    )
    .addOption(new Option("--rate-limit <limit>", "the max number of transactions to fulfil per block")
        .default(defaultRateLimit)
        .env("BLOCKLOCK_RATE_LIMIT")
    )

const options = program
    .parse()
    .opts()

const {combine, timestamp, json, errors} = winston.format
export const LOG = winston.createLogger({
    level: options.logLevel,
    format: combine(errors({stack: true}), timestamp(), json()),
    transports: [new winston.transports.Console()],
})

async function main() {
    const config = await setup()
    const {port, rpc, contract, rateLimit, ethAddress} = config
    const contractAddress = await contract.getAddress()
    LOG.info("application started", {rateLimit, port, contractAddress, ethAddress, rpc: options.rpcUrl})

    // any time a new block comes in, we check if any of the jobs we've seen need fulfilled
    const fulfilSignatures = await createSignatureListener(config)
    await rpc.on("block", fulfilSignatures)
    startApiServer(port)

    await keepAlive()
}

export type SetupParams = {
    port: number
    rpc: AbstractProvider,
    signing: Signing,
    ethAddress: AddressLike,
    contract: DecryptionSender
    rateLimit: number
}

async function setup(): Promise<SetupParams> {
    const bls = await BlsBn254.create()
    const {secretKey} = bls.createKeyPair(options.blsKey)
    const rpc = await createProviderWithRetry(options.rpcUrl, {pollingInterval: parseInt(options.pollingInterval)})
    const wallet = new NonceManager(new Wallet(options.privateKey, rpc))

    LOG.debug(`connected wallet with address ${await wallet.getAddress()}`)

    return {
        rpc,
        ethAddress: await wallet.getAddress(),
        rateLimit: options.rateLimit,
        signing: {bls, blsSecretKey: secretKey},
        port: parseInt(options.port),
        contract: DecryptionSender__factory.connect(options.decryptionSenderAddr, wallet),
    }
}

type DecryptionRequestWithId = { requestId: bigint, request: TypesLib.DecryptionRequestStructOutput }

async function createSignatureListener(config: SetupParams) {
    const {contract, signing, rpc} = config;
    const processingRequests = new Set<number>();
    const MAX_RETRIES = 1; // maximum retries for errored request ids
    const GAS_BUFFER_PERCENT = 200n; // 80% buffer for gas estimates
    const BLOCK_GAS_LIMIT = 10000000000n;
    const retryCount = new Map<bigint, number>();

    return async function (chainHeight: BigNumberish) {
        const currentBlockNumber = await rpc.getBlockNumber();
        LOG.debug(`Listener processing chain height: ${chainHeight}, Current block number: ${currentBlockNumber}`);

        // Fetch all errored request IDs and filter only those needing retry
        const erroredRequestIds = (await contract.getAllErroredRequestIds.staticCall()).filter(id => id >= 74);
        const retryableRequestIds: bigint[] = [];

        for (const requestId of erroredRequestIds) {
            const stillErrored = await contract.hasErrored(requestId);
            const retries = retryCount.get(requestId) || 0;

            if (stillErrored && retries < MAX_RETRIES && !processingRequests.has(Number(requestId))) {
                retryableRequestIds.push(requestId);
            } else if (retries >= MAX_RETRIES) {
                LOG.debug(`Skipping errored request ${requestId} as it reached max retries.`);
            }
        }

        if (retryableRequestIds.length > 0) {
            LOG.info(`Processing ${retryableRequestIds.length} errored requests: ${retryableRequestIds.join(", ")}`);

            const retryCalls = retryableRequestIds.map(requestId =>
                contract.interface.encodeFunctionData("retryCallback", [requestId])
            );

            try {
                retryableRequestIds.forEach(id => processingRequests.add(Number(id)));

                const estimatedGas = await contract.multicall.estimateGas(retryCalls);
                const gasLimit = min(BLOCK_GAS_LIMIT, ((estimatedGas * (100n + GAS_BUFFER_PERCENT)) / 100n));
                const gasPrice = ((await rpc.getFeeData()).gasPrice! * (100n + GAS_BUFFER_PERCENT)) / 100n;

                const tx = await contract.multicall(retryCalls, {gasLimit, gasPrice});
                LOG.info(`Retry transaction sent: ${tx.hash}`);

                const receipt = await tx.wait(1);
                if (receipt!.status === 1) {
                    LOG.info(`Retried ${retryableRequestIds.length} errored requests successfully`);
                    retryableRequestIds.forEach(id => retryCount.set(id, (retryCount.get(id) || 0) + 1));
                } else {
                    LOG.error(`Retry transaction failed: ${tx.hash}`);
                }
            } catch (err) {
                LOG.error("Failed to retry errored requests", {errorMessage: extractErrorMessage(err, contract.interface)});
            } finally {
                retryableRequestIds.forEach(id => processingRequests.delete(Number(id)));
            }
        } else {
            LOG.debug(`No errored requests to process at chainHeight ${chainHeight}`);
        }

        // Fetch unfulfilled requests
        const unfulfilledRequestIds = await contract.getAllUnfulfilledRequestIds.staticCall();
        if (unfulfilledRequestIds.length === 0) {
            LOG.debug(`No decryptions to process at chainHeight ${chainHeight}`);
            return;
        }

        const unfulfilledRequests: Array<DecryptionRequestWithId> = await Promise.all(
            unfulfilledRequestIds.map(async requestId => {
                const request = await contract.getRequest(requestId);
                return {request, requestId};
            })
        );

        // Process unfulfilled decryption requests sequentially
        const conditionToDecryptions = groupBy(unfulfilledRequests, (req: DecryptionRequestWithId) => BigInt(req.request.condition));
        let fulfilledThisBlock = 0;

        for (const [condition, decryptionRequests] of conditionToDecryptions.entries()) {
            if (Number(condition) > Number(chainHeight)) {
                LOG.debug(`Condition block number ${condition} not reached, skipping.`);
                continue;
            }

            const baseSignature = signatureForChainHeight(signing, condition);
            const decryptionKeyPoint = {x: baseSignature[0], y: baseSignature[1]};

            for (const decryptionRequest of decryptionRequests) {
                if (processingRequests.has(Number(decryptionRequest.requestId))) {
                    LOG.debug(`Request ID ${decryptionRequest.requestId} already processing, skipping.`);
                    continue;
                }

                const isErrored = await contract.hasErrored(decryptionRequest.requestId);
                if (isErrored) {
                    LOG.debug(`Request ${decryptionRequest.requestId} has errored, skipping.`);
                    continue;
                }

                if (fulfilledThisBlock >= options.rateLimit) {
                    LOG.debug(`Rate limit reached for chainHeight ${condition}`);
                    return;
                }

                LOG.info(`Processing Request ID ${decryptionRequest.requestId}`);
                processingRequests.add(Number(decryptionRequest.requestId));

                const solidityCiphertext = parseSolidityCiphertext(decryptionRequest.request.ciphertext);
                const decryptionKey = preprocess_decryption_key_g1(solidityCiphertext, decryptionKeyPoint, BLOCKLOCK_IBE_OPTS);

                try {
                    const estimatedGas = await contract.fulfilDecryptionRequest.estimateGas(
                        decryptionRequest.requestId,
                        decryptionKey,
                        encode(["uint256", "uint256"], [baseSignature[0], baseSignature[1]])
                    );

                    const gasLimit = min(BLOCK_GAS_LIMIT, ((estimatedGas * (100n + GAS_BUFFER_PERCENT)) / 100n));
                    const gasPrice = ((await rpc.getFeeData()).gasPrice! * (100n + GAS_BUFFER_PERCENT)) / 100n;

                    const tx = await contract.fulfilDecryptionRequest(
                        decryptionRequest.requestId,
                        decryptionKey,
                        encode(["uint256", "uint256"], [baseSignature[0], baseSignature[1]]),
                        {gasLimit, gasPrice}
                    );

                    LOG.info(`Transaction sent for Request ID ${decryptionRequest.requestId}: ${tx.hash}`);

                    const receipt = await tx.wait(1);
                    if (receipt!.status === 1) {
                        LOG.info(`Transaction confirmed for Request ID ${decryptionRequest.requestId}: ${tx.hash}`);
                        fulfilledThisBlock++;
                        reportDecryptionSuccessful(decryptionRequest.request.callback)
                    } else {
                        LOG.error(`Transaction failed for Request ID ${decryptionRequest.requestId}: ${tx.hash}`);
                        reportDecryptionError(decryptionRequest.request.callback)
                    }
                } catch (err) {
                    LOG.error(`Unable to process request ${decryptionRequest.requestId}`, {errorMessage: extractErrorMessage(err, contract.interface)});
                } finally {
                    processingRequests.delete(Number(decryptionRequest.requestId));
                }
            }
        }

        LOG.debug(`Finished processing chain height ${chainHeight}`)
        reportChainHeight(chainHeight)
    };
}


main()
    .then(() => {
        process.exit(0)
    })
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
