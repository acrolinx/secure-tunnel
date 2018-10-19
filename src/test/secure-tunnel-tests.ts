/* Copyright (c) 2018-present Acrolinx GmbH */

import "mocha";
import 'isomorphic-fetch';
import { expect } from 'chai';
import 'chai-string';
import chai = require('chai');
import chaiString = require('chai-string');
import { SecureTunnel, SslConfig, SecureTunnelConfig } from '../ts/secure-tunnel.net';
import { URL, Url } from "url";
import { SsoConfig, Tunnel } from "../ts/secure-tunnel.def";
import { createCertificate, CertificateCreationResult } from "pem";
import { Suite } from "mocha";
import * as https from "https";
import * as tmp from "tmp";
import * as fs from "fs";
import { Certificate } from "crypto";
import { fail } from "assert";

chai.use(chaiString);
describe("test server", () => {
    it("is online at all", async () => {
        const result = await fetch("https://test-ssl.acrolinx.com/iq/services/rest/registry/knownServiceNames");
        expect(result.status).to.be.eq(200);
        const json = await result.json();
        expect(json).to.contain("core");
    });

    it("test http", async () => {
        await new SecureTunnel(config).testUrl(new URL("http://test.acrolinx.com:8031"), { secure: true });
    });

    it("test https", async () => {
        await new SecureTunnel(config).testUrl(new URL("https://test-ssl.acrolinx.com"), { secure: true });
    });

    it("test https without certificate fails", async () => {
        const tmpFile = tmp.fileSync({});
        try {
            await new SecureTunnel(config).testUrl(new URL("https://test-ssl.acrolinx.com"), { secure: true, ca: [tmpFile.name] });
            fail("the call should throw an exception");
        }
        catch (e) {
            console.log("Expected exception: " + e + " everything's fine.")
        }
        finally {
            tmpFile.removeCallback();
        }

    });
});

const config: SecureTunnelConfig = {
    silent: false,
    verbose: true,
    requests: true
};

const startTunnelAndFetch = async (tunnel: SecureTunnel, localUrl: string, remoteUrl: string, sslConfig: SslConfig) => {
    tunnel.startTunnel(new URL(localUrl), new URL(remoteUrl), sslConfig, undefined, undefined, undefined);
    return await fetch(localUrl + "/iq/services/rest/registry/knownServiceNames");
}

const startSslTunnelAndGet = async (tunnel: SecureTunnel, localUrl: string, remoteUrl: string, port: number, sslConfig: SslConfig, certificate?: string) => {
    tunnel!.startTunnel(new URL(localUrl), new URL(remoteUrl), sslConfig, undefined, undefined, undefined);
    const data = await new Promise((resolve, reject) => {
        try {
            https.get({
                hostname: "localhost",
                port: port,
                path: "/iq/services/rest/registry/knownServiceNames",
                protocol: "https:",
                ca: certificate
            }, (res) => {
                let content = "";
                res.on("data", (data) => {
                    content += data;
                });
                res.on("end", () => {
                    try {
                        resolve(JSON.parse(content));
                    }
                    catch (err) {
                        console.error("rejecting (1) because of: " + err);
                        reject(err);
                    }
                });
                res.on("error", (err) => {
                    console.error("rejecting (2) because of: " + err);
                    reject(err);
                });
            }).on("error", (err) => {
                console.error("rejecting (3) because of: " + err);
                reject(err);
            }).end();
        }
        catch (err) {
            console.error("rejecting (4) because of: " + err);
            reject(err);
        }
    });

    return data;
}

const randomPort = () => {
    return Math.floor(Math.random() * 10000 + 18031);
}

describe("http tunnel", () => {
    let t: { tunnel?: SecureTunnel } = { tunnel: undefined };

    beforeEach(() => {
        t.tunnel = new SecureTunnel(config);
    });

    it("to http", async () => {
        const result = await startTunnelAndFetch(t.tunnel!, "http://localhost:" + randomPort(), "http://test.acrolinx.com:8031", { secure: true });
        expect(result.status).to.be.eq(200);
        const json = await result.json();
        expect(json).to.contain("core");
        return true;
    });

    it("to https", async () => {
        const result = await startTunnelAndFetch(t.tunnel!, "http://localhost:" + randomPort(), "https://test-ssl.acrolinx.com", { secure: true });
        expect(result.status).to.be.eq(200);
        const json = await result.json();
        expect(json).to.contain("core");
        return true;
    });

    afterEach(() => {
        if (t.tunnel) {
            t.tunnel.close();
            t.tunnel = undefined;
        }
    })
});

describe("https tunnel", function () {
    let t: {
        tunnel?: SecureTunnel,
        keys?: SslConfig,
        files: tmp.SynchrounousResult[],
        certificates: CertificateCreationResult | undefined
    } = {
        tunnel: undefined,
        keys: undefined,
        files: [],
        certificates: undefined
    };

    this.timeout(60000);

    const createTmpFile = () => {
        const tmpFile = tmp.fileSync({});
        t.files.push(tmpFile);
        return tmpFile.name;
    }
    beforeEach(async () => {
        t.tunnel = new SecureTunnel(config);

        const certificates = await new Promise<CertificateCreationResult>((resolve, reject) => {
            const certificates = createCertificate({ days: 1, selfSigned: true }, (error, keys) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(keys);
            });
        });
        if (certificates) {
            t.certificates = certificates;
            t.keys = {
                key: createTmpFile(),
                cert: createTmpFile(),
                secure: true
            };
            fs.writeFileSync(t.keys!.key!, certificates.clientKey);
            fs.writeFileSync(t.keys!.cert!, certificates.certificate);
        }
    });
    afterEach(() => {
        if (t.tunnel) {
            t.tunnel.close();
            t.tunnel = undefined;
        }
        while (t.files.length > 0) {
            t.files.pop()!.removeCallback();
        }
    })

    it("to http", async () => {
        const port = randomPort();
        const data = await startSslTunnelAndGet(t.tunnel!, "https://localhost:" + port, "http://test.acrolinx.com:8031", port, t.keys!, t.certificates!.certificate);
        expect(data).to.contain("core");
        return true;
    });

    it("to http fails if no certificate", async () => {
        const port = randomPort();
        let data;
        try {
            console.log("waiting...");
            data = await startSslTunnelAndGet(t.tunnel!, "https://localhost:" + port, "http://test.acrolinx.com:8031", port, t.keys!, undefined);
            console.log("waiting finished");
        }
        catch (error) {
            console.log("error?");
            if ("DEPTH_ZERO_SELF_SIGNED_CERT" === error.code) {
                return true;
            }
            fail("Unexpected error: " + error);
        }
        fail("expected self signed certificate error");
        return false;
    });

    it("to https", async () => {
        const port = randomPort();
        const data = await startSslTunnelAndGet(t.tunnel!, "https://localhost:" + port, "https://test-ssl.acrolinx.com", port, t.keys!, t.certificates!.certificate);
        expect(data).to.contain("core");
        return true;
    });

    it("to https fails if no certificate", async () => {
        const port = randomPort();
        let data;
        try {
            data = await startSslTunnelAndGet(t.tunnel!, "https://localhost:" + port, "https://test-ssl.acrolinx.com", port, t.keys!, undefined);
        }
        catch (error) {
            if ("DEPTH_ZERO_SELF_SIGNED_CERT" === error.code) {
                return true;
            }
            fail("Unexpected error: " + error);
        }
        fail("expected self signed certificate error");
        return false;
    });
});
