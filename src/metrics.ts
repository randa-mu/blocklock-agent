import {MeterProvider} from "@opentelemetry/sdk-metrics"
import {PrometheusExporter} from "@opentelemetry/exporter-prometheus"
import {ValueType} from "@opentelemetry/api"
import {BigNumberish} from "ethers"
import {LOG} from "./index"

const prometheusExporter = new PrometheusExporter(
    {preventServerStart: true},
    () => LOG.info("prometheus server started")
)
const meterProvider = new MeterProvider({readers: [prometheusExporter]})
const meter = meterProvider.getMeter("blocklock")

const decryptionCounter = meter.createCounter("decryption_request", {
    description: "Number of decryption keys submitted successfully",
    valueType: ValueType.INT,
})

function reportDecryptionSuccessful(decrypterAddress: string) {
    decryptionCounter.add(1, {address: decrypterAddress})
}

const errorDecryptionCounter = meter.createCounter("decryption_request_error", {
    description: "Number of decryption key submissions that errored",
    valueType: ValueType.INT,
})

function reportDecryptionError(decrypterAddress: string) {
    errorDecryptionCounter.add(1, {address: decrypterAddress})
}

const chainHeightReached = meter.createGauge("chain_height_reached", {
    description: "The last chain height successfully processed",
    valueType: ValueType.INT,
})

function reportChainHeight(chainHeight: BigNumberish) {
    chainHeightReached.record(Number(chainHeight))
}

export {prometheusExporter, reportDecryptionError, reportDecryptionSuccessful, reportChainHeight}