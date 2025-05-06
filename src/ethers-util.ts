import {EthersError, Interface} from "ethers"

export function isEthersError(error: unknown): error is EthersError {
    return (error as EthersError)?.code !== undefined;
}

export function extractErrorMessage(err: unknown, iface: Interface): string {
    if (!isEthersError(err)) {
        return (err as Error).message
    }
    switch (err.code) {
        case "CALL_EXCEPTION": {
            /* eslint-disable @typescript-eslint/no-explicit-any */
            const e = err as any
            if (!e.data) {
                return `unknown call exception: ${err.message}`
            }
            const parsedError = iface.parseError(e.data)
            if (!parsedError) {
                return `unknown error: ${e.message}`
            }
            return serialise({
                name: parsedError.name,
                args: parsedError.args,
            })
        }
        case "INSUFFICIENT_FUNDS":
            return "insufficient funds"
        case "NONCE_EXPIRED":
            return "your nonce expired - did you resend the tx?"
        default:
            return `unknown error: ${err.message}`
    }
}

function serialise(obj: unknown) {
    return JSON.stringify(obj, (_, value) =>
        typeof value === "bigint"
            ? Number(value)
            : value
    )
}
