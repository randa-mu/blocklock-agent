import express from "express"
import {LOG} from "./index"
import {prometheusExporter} from "./metrics"

export function groupBy<T, U>(arr: Array<T>, mapper: (t: T) => U): Map<U, Array<T>> {
    return arr.reduce((acc, next) => {
        const key = mapper(next)
        const current = acc.get(key) ?? []
        acc.set(key, [...current, next])
        return acc
    }, new Map<U, Array<T>>())
}

export function startApiServer(port: number) {
    const app = express()
    app.use(express.json())
    app.get("/", (_, res) => {
        res.status(200).send()
    })
    app.get("/metrics", async (req, res) => {
        prometheusExporter.getMetricsRequestHandler(req, res)
    })
    app.listen(port, () => {
        LOG.info(`blocklock writer running on port ${port}`)
    })
}

export async function keepAlive() {
    return new Promise<void>((resolve) => {
        process.stdin.resume()
        process.on("SIGINT", () => {
            console.log("Shutting down listener...")
            resolve()
        })
    })
}

export function min(a: bigint, b: bigint): bigint {
    if (a < b) {
        return a
    }
    return b
}