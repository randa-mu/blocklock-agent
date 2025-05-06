import {AbiCoder, BytesLike, getBytes, ParamType} from "ethers"
import {Fr} from "mcl-wasm"
import {BLOCKLOCK_IBE_OPTS} from "./index"
import {Ciphertext} from "./crypto/ibe-bn254"
import {BlsBn254} from "./crypto/bls-bn254"

type Signer = {
    bls: BlsBn254,
    blsSecretKey: Fr
}

export function signatureForChainHeight(signer: Signer, chainHeight: bigint): [bigint, bigint] {
    const m = encode(["uint256"], [chainHeight])
    const h_m = signer.bls.hashToPoint(BLOCKLOCK_IBE_OPTS.dsts.H1_G1, m)
    const {signature} = signer.bls.sign(h_m, signer.blsSecretKey)
    return signer.bls.serialiseG1Point(signature)
}

export function parseSolidityCiphertext(ciphertext: BytesLike): Ciphertext {
    const ctBytes = getBytes(ciphertext)
    const ct = AbiCoder.defaultAbiCoder().decode(["tuple(tuple(uint256[2] x, uint256[2] y) u, bytes v, bytes w)"], ctBytes)[0]

    const uX0 = ct.u.x[0]
    const uX1 = ct.u.x[1]
    const uY0 = ct.u.y[0]
    const uY1 = ct.u.y[1]
    return {
        U: {x: {c0: uX0, c1: uX1}, y: {c0: uY0, c1: uY1}},
        V: getBytes(ct.v),
        W: getBytes(ct.w),
    }
}

export function encode(types: Array<string | ParamType>, values: Array<unknown>): Uint8Array {
    return getBytes(AbiCoder.defaultAbiCoder().encode(types, values))
}
