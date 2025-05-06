import {AbstractProvider, JsonRpcApiProviderOptions, JsonRpcProvider, WebSocketProvider} from "ethers"
import {LOG} from "./index"

export async function createProviderWithRetry(url: string, options: JsonRpcApiProviderOptions = {}, maxRetries = 20, retryDelay = 1000): Promise<AbstractProvider> {
    return withRetry(async () => {
        const provider = wsOrJson(url, options)
        // if we can fetch the block number successfully, then we're connected
        await provider.getBlockNumber()
        LOG.info("connected to JSON-RPC endpoint.")
        return provider
    }, "connection failed. Retrying...", maxRetries, retryDelay)
}

function wsOrJson(url: string, options: JsonRpcApiProviderOptions = {}) {
    if (url.startsWith("ws")) {
        return new WebSocketProvider(url, undefined, options)
    } else {
        return new JsonRpcProvider(url, undefined, options)
    }
}

export async function withRetry<T>(fn: () => Promise<T>, retryMessage = "retrying...", maxRetries = 20, retryDelay = 1000): Promise<T> {
    try {
        return await fn()
    } catch (err) {
        if (maxRetries <= 1) {
            throw err
        }
        LOG.info(retryMessage)
        await new Promise((resolve) => setTimeout(resolve, retryDelay))
        return withRetry(fn, retryMessage, maxRetries - 1, retryDelay)
    }
}
