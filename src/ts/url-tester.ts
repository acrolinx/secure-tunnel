/* Copyright (c) 2018-present Acrolinx GmbH */

import { URL, Url } from "url";
import * as http from "http";
import * as https from "https";
import { SslConfig, SecureTunnelConfig } from "./secure-tunnel.net";
import * as _ from "lodash";

let ProxyAgent = require("proxy-agent");

export function testUrl(label: string, url: URL, config: SecureTunnelConfig, sslConfig: SslConfig, proxyUri?: URL) {
    return new Promise((resolve, reject) => {
        let proxyAgent: any = proxyUri ? new ProxyAgent(proxyUri) : null;
        if (config.verbose) {
            console.log(label, "Connecting: " + url.toString());
        }

        let options: http.RequestOptions = {
            agent: proxyAgent,
            port: url.port,
            hostname: url.hostname,
            method: "GET",
            path: url.pathname,
            protocol: url.protocol,
            host: url.host
        };

        if (url.protocol.startsWith("https")) {
            https
                .request(
                    _.assign(options, {
                        rejectUnauthorized: sslConfig.secure,
                        ca: sslConfig.ca
                    }),
                    res => {
                        if (!config.silent) {
                            console.log(
                                label, "Connected",
                                url.toString(),
                                res.statusCode,
                                res.statusMessage
                            );
                        }
                        resolve(true);
                    }
                )
                .on("error", err => {
                    if (!config.silent) {
                        console.error(label, url.toString(), err);
                    }
                    reject();
                })
                .end();
            return;
        }
        http
            .request(options, res => {
                if (!config.silent) {
                    console.log(label, "Connected", url.toString(), res.statusCode, res.statusMessage);
                }
                resolve(true);
            })
            .on("error", err => {
                if (!config.silent) {
                    console.error(label, url.toString(), err);
                }
                reject();
            })
            .end();
    });
}