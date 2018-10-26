/* Copyright (c) 2018-present Acrolinx GmbH */

import * as http from "http";
import { Tunnel } from "./secure-tunnel.def";
import { Url } from "url";

export function create(label: string, proxyUri: Url | undefined, tunnels: Tunnel[], silent?: boolean) {
    return http
        .createServer((req, res) => {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
                "<html><head><title>Acrolinx Secure Tunnel</title></head><body><h1>Acrolinx Secure Tunnel</h1><h2>Proxy</h2>" +
                '<div><a href="' +
                proxyUri +
                '">' +
                proxyUri +
                "</a></div><h2>Tunnels</h2>" +
                tunnels
                    .map(
                        p =>
                            '<div><a href="' +
                            p.localUrl.toString() +
                            '">' +
                            p.localUrl.toString() +
                            '</a> -> <a href="' +
                            p.targetUrl.toString() +
                            '"</a>' +
                            p.targetUrl.toString() +
                            "</a></div>"
                    )
                    .join() +
                "</body></html>"
            );
        })
        .on("error", err => {
            if (!silent) {
                console.error(label, "info server", err);
            }
        });
}