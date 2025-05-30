import { describe, it, expect } from "@jest/globals"
import { decrypt_g1, decrypt_g1_with_preprocess, deserializeCiphertext, encrypt_towards_identity_g1, get_identity_g1, preprocess_decryption_key_g1, serializeCiphertext } from "../../src/crypto/ibe-bn254"
import { bn254 } from "../../src/crypto/bn254"

describe("ibe bn254", () => {
    it("consistency", async () => {
        const m = new Uint8Array(Buffer.from('IBE BN254 Consistency Test'))
        const identity = Buffer.from('TEST')
        const identity_g1 = bn254.G1.ProjectivePoint.fromAffine(await get_identity_g1(identity))

        const x = bn254.G1.normPrivateKeyToScalar(bn254.utils.randomPrivateKey())
        const X_G2 = bn254.G2.ProjectivePoint.BASE.multiply(x).toAffine()
        const sig = identity_g1.multiply(x).toAffine()

        const ct = await encrypt_towards_identity_g1(m, identity, X_G2)
        const m2 = await decrypt_g1(ct, sig)
        expect(m).toEqual(m2)
    })

    it("consistency with preprocessing", async () => {
        const m = new Uint8Array(Buffer.from('IBE BN254 Consistency Test'))
        const identity = Buffer.from('TEST')
        const identity_g1 = bn254.G1.ProjectivePoint.fromAffine(await get_identity_g1(identity))

        const x = bn254.G1.normPrivateKeyToScalar(bn254.utils.randomPrivateKey())
        const X_G2 = bn254.G2.ProjectivePoint.BASE.multiply(x).toAffine()
        const sig = identity_g1.multiply(x).toAffine()

        const ct = await encrypt_towards_identity_g1(m, identity, X_G2)
        const decryption_key = await preprocess_decryption_key_g1(ct, sig)

        console.log(decryption_key)
        const m2 = decrypt_g1_with_preprocess(ct, decryption_key)

        expect(m).toEqual(m2)
    })

    it("serialization", async () => {
        const m = new Uint8Array(Buffer.from('IBE BN254 Serialization Test'))
        const identity = Buffer.from('TEST')

        const x = bn254.G1.normPrivateKeyToScalar(bn254.utils.randomPrivateKey())
        const X_G2 = bn254.G2.ProjectivePoint.BASE.multiply(x).toAffine()

        const ct = await encrypt_towards_identity_g1(m, identity, X_G2)

        const serCt = serializeCiphertext(ct)
        const deserCt = deserializeCiphertext(serCt)
        expect(ct).toEqual(deserCt)
    })
})
