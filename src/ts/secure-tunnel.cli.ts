/* Copyright (c) 2017-present Acrolinx GmbH */

import { Tunnel, SsoConfig, Config } from "./secure-tunnel.def";
import { URL } from "url";
import * as program from "commander";
import * as Registry from "winreg";
import { SecureTunnel } from "./secure-tunnel.net";

const test: string = "https://test-ssl.acrolinx.com";

let toTunnelMapping: (args: string[]) => Tunnel[] = args => {
  const filteredForArrow = args
    .filter(arg => {
      if (arg.indexOf("->") === -1) {
        console.log(new Date().toISOString(), "ignoring argument: " + arg);
        return false;
      }
      return true;
    })
    .map(arg => arg.split("->"))
    .filter(urls => urls.length === 2);

  const tunnels = filteredForArrow.map(urls => {
    try {

      let tunnel: Tunnel = {
        localUrl: new URL(urls[0]),
        targetUrl: new URL(urls[1])
      };
      return tunnel;
    }
    catch (e) {
      console.error(new Date().toISOString(), "Ignoring illegal tunnel", urls.map(url => "" + url), ": " + e);
      return undefined;
    }
  });

  const validTunnels = tunnels.filter(tunnel => tunnel !== undefined);
  return validTunnels as Tunnel[];
};

async function getRegKey(
  hive: string,
  path: string,
  key: string
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    new Registry({
      hive: hive,
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
      hive: hive,
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
  private constructor() { }

  static async parse(argv: string[], env: NodeJS.ProcessEnv): Promise<Config> {
    let config = new Cli();
    let p = config.defineProgramUsage();
    let c = p.parse(argv);

    config.verbose = c.verbose;
    config.silent = c.silent;
    config.requests = c.requests;
    config.secure = !!c.secure;
    config.key = c.key;
    config.passphrase = c.passphrase;
    config.cert = c.cert;
    config.store = c.store;
    config.token = c.token;
    config.infopage = c.infopage;

    config.tunnels = toTunnelMapping(c.args);

    config.useSystemProxy = c.system_proxy;
    config.useEvnironmentProxy = c.evnironment_proxy;

    try {
      if (c.autorun) {
        if (!/^win/.test(process.platform)) {
          if (!c.silent) {
            console.log(new Date().toISOString(), "Autorun only supported on windows.");
          }
          throw "Autorun only supported on windows.";
        }
        await setRegKey(
          Registry.HKCU,
          "\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
          "acrolinx-secure-tunnel",
          argv.map(s => '"' + s.replace('"', '\\"') + '"').join(" ")
        );
      }
    } catch (err) {
      console.error(new Date().toISOString(), "Failed to set autorun: " + err);
    }
    try {

      config.sso = config.getSsoConfig(c.sso);
    } catch (e) {
      console.error(new Date().toISOString(), "Failed to set SSO config: " + e);
    }
    if (c.info_url) {
      try {
        config.infoUrl = new URL(c.info_url);
      }
      catch (e) {
        console.error(new Date().toISOString(), "Failed to set info URL: " + c.info_url + " - " + e);
      }
    }
    config.proxyUrl = await config.getProxyUrl(argv, env, c);
    return config;
  }

  private async getProxyUrl(
    argv: string[],
    env: NodeJS.ProcessEnv,
    c: any
  ): Promise<URL | undefined> {
    try {
      if (c.proxy) {
        return new URL(c.proxy);
      }

      let http_proxy = env.http_proxy;
      if (c.evnironment_proxy && http_proxy) {
        return new URL(http_proxy);
      }

      if (!c.system_proxy) {
        return;
      }

      if (!/^win/.test(process.platform)) {
        if (!c.silent) {
          console.log(new Date().toISOString(),
            "System proxy only supported on windows. Use -S to disable system proxy usage."
          );
        }
        return;
      }

      let isProxyEnabled = await getRegKey(
        Registry.HKCU,
        "\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
        "ProxyEnable"
      );
      if (!isProxyEnabled || isProxyEnabled === "0x0") {
        return;
      }

      let proxyUrl = await getRegKey(
        Registry.HKCU,
        "\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
        "ProxyServer"
      );

      if (!proxyUrl) {
        return;
      }

      if (!proxyUrl.toLowerCase().startsWith("http")) {
        return new URL("http://" + proxyUrl);
      } else {
        return new URL(proxyUrl);
      }
    } catch (e) {
      console.error(new Date().toISOString(), "Failed to set proxy: " + e);
      return;
    }
  }

  private defineProgramUsage() {
    let p = program
      .description("Acrolinx Secure Tunnel")
      .version("INTERNAL")
      .usage("[options] <local-URL->server-URL ...>")
      .option("-v, --verbose", "show accessed URLs")
      .option("-r, --requests", "show requests and responses")
      .option("-s, --silent", "don't show info messages & status page")
      .option("-p, --proxy <proxy server URL>", "use the given proxy server")
      .option("-S, --no-system_proxy", "don't use windows system proxy")
      .option("-E, --no-evnironment_proxy", "don't use env proxy server")
      .option("-a, --autorun", "add current configuration to autorun (windows only)")
      .option("-C, --no-secure", "no certificate validation")
      .option("-k, --key <key.pem>", "private key file")
      .option("-c, --cert <cert.pem>", "certificate file")
      .option(
        "-e, --passphrase <private key passphrase>",
        "password for private key"
      )
      .option(
        "-i, --info_url <local url>",
        "the local URL that will show the Acrolinx Secure Tunnel status page"
      )
      .option(
        "-o, --sso <username:generic token>",
        "add single sign-on headers to all calls"
      )
      // .option(
      //   "-u, --unified_authentication",
      //   "pop up unified authentication and inject token"
      // )
      .option(
        "-t, --store <certificate store file>",
        "use a custom certificate store"
      )
      .option(
        "-n, --token <authorization token>",
        "add an authorization token to all requests"
      );
    return p;
  }

  private getSsoConfig(sso: string): SsoConfig | undefined {
    if (!sso) {
      return undefined;
    }
    const ssoValues = sso.split(":");

    if (ssoValues.length !== 2) {
      if (!this.silent) {
        console.log(new Date().toISOString(), "invalid sso: " + sso);
      }
      return undefined;
    }

    return {
      username: ssoValues[0],
      token: ssoValues[1]
    };
  }
}
