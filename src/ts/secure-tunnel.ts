/* Copyright (c) 2017-present Acrolinx GmbH */

import * as fs from 'fs';
import * as _ from 'lodash';
import opn = require('opn');
import {URL} from 'url';
import {Cli} from './secure-tunnel.cli';
import {Config} from './secure-tunnel.def';
import {SecureTunnel, SslConfig} from './secure-tunnel.net';
import {hashJson} from './util';


// tslint:disable no-floating-promises

async function start(p: NodeJS.Process) {
  const config: Config = await Cli.parse(p.argv, p.env);
  const tunnel = new SecureTunnel({
    silent: config.silent,
    requests: config.requests,
    verbose: config.verbose
  });

  if (config.verbose) {
    console.log(new Date().toISOString(), hashJson(config), JSON.stringify(config, null, ' '));
  }
  if (config.infoUrl) {
    tunnel.startInfoServer(
      config.infoUrl,
      config.proxyUrl,
      config.tunnels
    );
  }

  let ca: string[] | undefined;
  if (config.store) {
    const store: string = fs.readFileSync(config.store).toString();
    ca = store
      .split(/-----END CERTIFICATE-----\n?/)
      .filter(c => c !== '')
      .map(c => c + '-----END CERTIFICATE-----\n');
  }

  const sslConfig: SslConfig = {
    key: config.key,
    cert: config.cert,
    passphrase: config.passphrase,
    ca,
    secure: config.secure
  };

  if (!sslConfig.secure) {
    console.warn("Warning: Tunnel has been started in a mode where it doesn't validate ssl certificates.");
  }

  config.tunnels.forEach(tunnelConf =>
    tunnel.startTunnel(
      tunnelConf.localUrl,
      tunnelConf.targetUrl,
      sslConfig,
      config.proxyUrl,
      config.token,
      config.sso
    )
  );
  if (config.infoUrl) {
    tunnel.testUrl(config.infoUrl, sslConfig);
  }
  _.uniq(config.tunnels.map(tunnelConf => tunnelConf.targetUrl)).forEach(url => {
    tunnel.testUrl(url, sslConfig, config.proxyUrl);
    tunnel.testUrl(new URL('/iq/services/v4/rest/core/serverVersion', url), sslConfig, config.proxyUrl);
    tunnel.testUrl(new URL('/sidebar/v14/version.properties', url), sslConfig, config.proxyUrl);
  });
  _.uniq(config.tunnels.map(tunnelConf => tunnelConf.localUrl)).forEach(url => {
    tunnel.testUrl(url, sslConfig);
    tunnel.testUrl(new URL('/iq/services/v4/rest/core/serverVersion', url), sslConfig, config.proxyUrl);
    tunnel.testUrl(new URL('/sidebar/v14/version.properties', url), sslConfig, config.proxyUrl);
  });

  if (!config.silent && config.infoUrl) {
    opn(config.infoUrl.toString());
  }
}

start(process);
