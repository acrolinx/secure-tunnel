/* Copyright (c) 2017-present Acrolinx GmbH */

import { SecureTunnel, SslConfig } from "./secure-tunnel.net";
import { Cli } from "./secure-tunnel.cli";
import { Config } from "./secure-tunnel.def";
import { URL, Url } from "url";
import * as _ from "lodash";
import opn = require("opn");
let fs = require("fs");

async function start(p: NodeJS.Process) {
  let config: Config = await Cli.parse(p.argv, p.env);
  let tunnel = new SecureTunnel({
    silent: config.silent,
    requests: config.requests,
    verbose: config.verbose
  });

  if (config.infoUrl) {
    console.log(JSON.stringify(config, null, " "));
    tunnel.startInfoServer(
      config.infoUrl,
      config.proxyUrl,
      config.tunnels
    );
  }

  let ca: string[] | undefined;
  if (config.store) {
    let store: string = fs.readFileSync(config.store).toString();
    ca = store
      .split(/-----END CERTIFICATE-----\n?/)
      .filter(c => c !== "")
      .map(c => c + "-----END CERTIFICATE-----\n");
  }

  let sslConfig: SslConfig = {
    key: config.key,
    cert: config.cert,
    passphrase: config.passphrase,
    ca: ca,
    secure: config.secure
  };

  if (!sslConfig.secure) {
    console.warn("Warning: Tunnel has been started in a mode where it doesn't validate ssl certificates.")
  }

  config.tunnels.forEach(p =>
    tunnel.startTunnel(
      p.localUrl,
      p.targetUrl,
      sslConfig,
      config.proxyUrl,
      config.token,
      config.sso
    )
  );
  if (config.infoUrl) {
    tunnel.testUrl(config.infoUrl, sslConfig);
  }
  _.uniq(config.tunnels.map(p => p.targetUrl)).forEach(url =>
    tunnel.testUrl(url, sslConfig, config.proxyUrl)
  );
  _.uniq(config.tunnels.map(p => p.localUrl)).forEach(url =>
    tunnel.testUrl(url, sslConfig)
  );

  if (!config.silent && config.infoUrl) {
    opn(config.infoUrl.toString());
  }
}

start(process);
