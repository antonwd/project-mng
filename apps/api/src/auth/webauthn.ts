import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from "@simplewebauthn/types";

export type WebAuthnConfig = { rpId: string; rpName: string; origin: string };

export class WebAuthnService {
  constructor(private cfg: WebAuthnConfig) {}

  async startRegistration(args: { userId: string; userName: string; excludeCredentialIds?: Uint8Array[] }) {
    const options = await generateRegistrationOptions({
      rpID: this.cfg.rpId,
      rpName: this.cfg.rpName,
      userName: args.userName,
      userID: new TextEncoder().encode(args.userId),
      attestationType: "none",
      authenticatorSelection: { userVerification: "preferred", residentKey: "preferred" },
      excludeCredentials: (args.excludeCredentialIds ?? []).map((id) => ({ id: Buffer.from(id).toString("base64url") })),
    });
    return { options, challenge: options.challenge };
  }

  async finishRegistration(args: { response: RegistrationResponseJSON; expectedChallenge: string }) {
    const verification = await verifyRegistrationResponse({
      response: args.response,
      expectedChallenge: args.expectedChallenge,
      expectedOrigin: this.cfg.origin,
      expectedRPID: this.cfg.rpId,
    });
    if (!verification.verified || !verification.registrationInfo) throw new Error("registration not verified");
    const info = verification.registrationInfo;
    return {
      credentialId: new Uint8Array(Buffer.from(info.credential.id, "base64url")),
      publicKey: new Uint8Array(info.credential.publicKey),
      signCount: BigInt(info.credential.counter),
      transports: info.credential.transports ?? [],
    };
  }

  async startAuthentication(args: { allowCredentialIds: Uint8Array[] }) {
    const options = await generateAuthenticationOptions({
      rpID: this.cfg.rpId,
      allowCredentials: args.allowCredentialIds.map((id) => ({ id: Buffer.from(id).toString("base64url") })),
      userVerification: "preferred",
    });
    return { options, challenge: options.challenge };
  }

  async finishAuthentication(args: {
    response: AuthenticationResponseJSON;
    expectedChallenge: string;
    storedPublicKey: Uint8Array;
    storedSignCount: bigint;
  }) {
    const verification = await verifyAuthenticationResponse({
      response: args.response,
      expectedChallenge: args.expectedChallenge,
      expectedOrigin: this.cfg.origin,
      expectedRPID: this.cfg.rpId,
      credential: {
        id: args.response.id,
        publicKey: Buffer.from(args.storedPublicKey),
        counter: Number(args.storedSignCount),
      },
    });
    if (!verification.verified) throw new Error("authentication not verified");
    return { newSignCount: BigInt(verification.authenticationInfo.newCounter) };
  }
}
