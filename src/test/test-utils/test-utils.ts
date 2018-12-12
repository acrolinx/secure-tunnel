import {URL} from 'url';
import {SecureTunnel, SslConfig} from '../../ts/secure-tunnel.net';

export function randomPort() {
  return Math.floor(Math.random() * 10000 + 18031);
}

export const SERVICE_NAMES_PATH = '/iq/services/rest/registry/knownServiceNames';

export async function startTunnelAndFetch(
  tunnel: SecureTunnel,
  localUrl: string,
  remoteUrl: string,
  sslConfig: SslConfig,
  path = SERVICE_NAMES_PATH
) {
  tunnel.startTunnel(new URL(localUrl), new URL(remoteUrl), sslConfig, undefined, undefined, undefined);
  return await fetch(localUrl + path);
}


export async function startSimpleTunnelAndFetch(
  tunnel: SecureTunnel,
  path = SERVICE_NAMES_PATH,
  fetchOpts: RequestInit = {}
) {
  const localBaseUrl = 'http://localhost:' + randomPort();
  tunnel.startTunnel(new URL(localBaseUrl), new URL('http://test.acrolinx.com:8031'), {secure: true});
  return await fetch(localBaseUrl + path, fetchOpts);
}
