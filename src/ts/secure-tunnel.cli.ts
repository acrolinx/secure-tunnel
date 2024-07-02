/* Copyright (c) 2017-present Acrolinx GmbH */

import { Command } from 'commander';
import {URL} from 'url';
import * as Registry from 'winreg';
import {
  BLOCK_WITHOUT_REQUIRED_COOKIE_CLI_OPTION,
  BLOCK_WITHOUT_REQUIRED_COOKIE_CLI_OPTION_DESCRIPTION
} from './block-without-required-cookie';
import {Config, SsoConfig, Tunnel} from './secure-tunnel.def';

const toTunnelMapping: (args: string[]) => Tunnel[] = args => {
  const filteredForArrow = args
    .filter(arg => {
      if (arg.indexOf('->') === -1) {
        console.log(new Date().toISOString(), 'ignoring argument: ' + arg);
        return false;
      }
      return true;
    })
    .map(arg => arg.split('->'))
    .filter(urls => urls.length === 2);

  const tunnels = filteredForArrow.map(urls => {
    try {

      const tunnel: Tunnel = {
        localUrl: new URL(urls[0]),
        targetUrl: new URL(urls[1])
      };
      return tunnel;
    } catch (e) {
      console.error(new Date().toISOString(), 'Ignoring illegal tunnel', urls.map(url => '' + url), ': ' + e);
      return undefined;
    }
  });

  const validTunnels = tunnels.filter(tunnel => tunnel !== undefined);
  return validTunnels;
};

async function getRegKey(
  hive: string,
  path: string,
  key: string
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    new Registry({
      hive,
      key: path
    }).get(key, (err, result) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(result.value);
    });
  });
}

async function setRegKey(
  hive: string,
  path: string,
  key: string,
  value: string
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    new Registry({
      hive,
      key: path
    }).set(key, Registry.REG_SZ, value, err => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

export class Cli implements Config {

  public static async parse(argv: string[], env: NodeJS.ProcessEnv): Promise<Config> {
    const config = new Cli();
    const p = config.defineProgramUsage();
    const c = p.parse(argv);
    const options = c.opts();

    config.verbose = options.verbose;
    config.silent = options.silent;
    config.requests = options.requests;
    config.secure = !!options.secure;
    config.key = options.key;
    config.passphrase = options.passphrase;
    config.cert = options.cert;
    config.store = options.store;
    config.token = options.token;
    config.infopage = options.infopage;

    config.tunnels = toTunnelMapping(c.args);

    config.useSystemProxy = options.system_proxy;
    config.useEvnironmentProxy = options.evnironment_proxy;

    config.blockWithoutRequiredCookie = !!options[BLOCK_WITHOUT_REQUIRED_COOKIE_CLI_OPTION];

    try {
      if (options.autorun) {
        if (!/^win/.test(process.platform)) {
          if (!options.silent) {
            console.log(new Date().toISOString(), 'Autorun only supported on windows.');
          }
          throw new Error('Autorun only supported on windows.');
        }
        await setRegKey(
          Registry.HKCU,
          '\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
          'acrolinx-secure-tunnel',
          argv.map(s => '"' + s.replace('"', '\\"') + '"').join(' ')
        );
      }
    } catch (err) {
      console.error(new Date().toISOString(), 'Failed to set autorun: ' + err);
    }
    try {

      config.sso = config.getSsoConfig(options.sso);
    } catch (e) {
      console.error(new Date().toISOString(), 'Failed to set SSO config: ' + e);
    }
    if (options.info_url) {
      try {
        config.infoUrl = new URL(options.info_url);
      } catch (e) {
        console.error(new Date().toISOString(), 'Failed to set info URL: ' + options.info_url + ' - ' + e);
      }
    }
    config.proxyUrl = await config.getProxyUrl(argv, env, c);
    return config;
  }

  public store?: string;
  public cert?: string;
  public passphrase?: string;
  public key?: string;
  public secure: boolean;
  public infoUrl: URL;
  public sso?: SsoConfig;
  public useEvnironmentProxy: boolean;
  public useSystemProxy: boolean;
  public proxyUrl?: URL;
  public tunnels: Tunnel[];
  public requests: boolean;
  public silent: boolean;
  public verbose: boolean;
  public token?: string;
  public infopage?: boolean;
  public blockWithoutRequiredCookie: boolean;

  private constructor() {
  }

  private async getProxyUrl(
    _argv: string[],
    env: NodeJS.ProcessEnv,
    c: any
  ): Promise<URL | undefined> {
    try {
      if (c.proxy) {
        return new URL(c.proxy);
      }

      const http_proxy = env.http_proxy;
      if (c.evnironment_proxy && http_proxy) {
        return new URL(http_proxy);
      }

      if (!c.system_proxy) {
        return;
      }

      if (!/^win/.test(process.platform)) {
        if (!c.silent) {
          console.log(new Date().toISOString(),
            'System proxy only supported on windows. Use -S to disable system proxy usage.'
          );
        }
        return;
      }

      const isProxyEnabled = await getRegKey(
        Registry.HKCU,
        '\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
        'ProxyEnable'
      );
      if (!isProxyEnabled || isProxyEnabled === '0x0') {
        return;
      }

      const proxyUrl = await getRegKey(
        Registry.HKCU,
        '\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
        'ProxyServer'
      );

      if (!proxyUrl) {
        return;
      }

      if (!proxyUrl.toLowerCase().startsWith('http')) {
        return new URL('http://' + proxyUrl);
      } else {
        return new URL(proxyUrl);
      }
    } catch (e) {
      console.error(new Date().toISOString(), 'Failed to set proxy: ' + e);
      return;
    }
  }

  private defineProgramUsage() {
    return new Command()
      .description('Acrolinx Secure Tunnel')
      .version('INTERNAL')
      .usage('[options] <local-URL->server-URL ...>')
      .option('-v, --verbose', 'show accessed URLs')
      .option('-r, --requests', 'show requests and responses')
      .option('-s, --silent', "don't show info messages & status page")
      .option('-p, --proxy <proxy server URL>', 'use the given proxy server')
      .option('-S, --no-system_proxy', "don't use windows system proxy")
      .option('-E, --no-evnironment_proxy', "don't use env proxy server")
      .option('-a, --autorun', 'add current configuration to autorun (windows only)')
      .option('-C, --no-secure', 'no certificate validation')
      .option('-k, --key <key.pem>', 'private key file')
      .option('-c, --cert <cert.pem>', 'certificate file')
      .option(
        '-e, --passphrase <private key passphrase>',
        'password for private key'
      )
      .option(
        '-i, --info_url <local url>',
        'the local URL that will show the Acrolinx Secure Tunnel status page'
      )
      .option(
        '-o, --sso <username:generic token>',
        'add single sign-on headers to all calls'
      )
      // .option(
      //   "-u, --unified_authentication",
      //   "pop up unified authentication and inject token"
      // )
      .option(
        '-t, --store <certificate store file>',
        'use a custom certificate store'
      )
      .option(
        '-n, --token <authorization token>',
        'add an authorization token to all requests'
      ).option(
        '--' + BLOCK_WITHOUT_REQUIRED_COOKIE_CLI_OPTION,
        BLOCK_WITHOUT_REQUIRED_COOKIE_CLI_OPTION_DESCRIPTION
      );
  }

  private getSsoConfig(sso: string): SsoConfig | undefined {
    if (!sso) {
      return undefined;
    }
    const ssoValues = sso.split(':');

    if (ssoValues.length !== 2) {
      if (!this.silent) {
        console.log(new Date().toISOString(), 'invalid sso: ' + sso);
      }
      return undefined;
    }

    return {
      username: ssoValues[0],
      token: ssoValues[1]
    };
  }
}
