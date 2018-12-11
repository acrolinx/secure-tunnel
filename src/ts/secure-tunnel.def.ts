/* Copyright (c) 2017-present Acrolinx GmbH */

import {URL} from 'url';

export interface Tunnel {
  localUrl: URL;
  targetUrl: URL;
}

export interface SsoConfig {
  username: string;
  token: string;
}

export interface Config {
  sso?: SsoConfig;
  useEvnironmentProxy: boolean;
  useSystemProxy: boolean;
  proxyUrl?: URL;
  tunnels: Tunnel[];
  requests: boolean;
  silent: boolean;
  verbose: boolean;
  infoUrl?: URL;
  secure: boolean;
  key?: string;
  cert?: string;
  passphrase?: string;
  store?: string;
  token?: string;
}

export interface SecureTunnelConfig {
  silent: boolean;
  verbose: boolean;
  requests: boolean;
}

export interface SslConfig {
  passphrase?: string;
  key?: string;
  cert?: string;
  ca?: string[];
  secure: boolean;
}
