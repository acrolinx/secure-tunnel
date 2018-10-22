# Acrolinx Secure Tunnel

## Introduction

Over the years, we've seen a lot of different scenarios how Acrolinx
Integrations want to connect to the Acrolinx Platform. While this is
smooth sailing in most cases, sometimes Acrolinx Integrations have
problems connecting to the Acrolinx Platform.

For those cases, the Acrolinx Secure Tunnel aims to be both a helpful
tool to analyze the problems and a secure solution for easy
connections to the Acrolinx Platform.

We describe different use cases [below](#use-cases).

Many use cases could also be solved with commonly available tools like
[nginx](https://nginx.org/en/), [Squid](http://www.squid-cache.org/),
or [stunnel](https://www.stunnel.org/). The Acrolinx Secure Tunnel
will automatically take care of a few peculiarities of the Acrolinx
Platform for you, making the setup easier in many cases. This is a
huge help if you're not familiar with those other tools. However,
you may of course consider other solutions based on
well-established, freely available programs.

### Targets Audiences

* System administrators who want to analyze problems that their users
  face when connecting to Acrolinx.
* Solution engineers who need to enable connections to the Acrolinx
  Platform in unusual scenarios.
* Writers who need to connect to the Acrolinx Platform in unusual
  scenarios.
* Writers who need to connect to different installations of the
  Acrolinx Platform and switch easily between them.
* Also developers, support engineers, and network engineers might
  benefit from Acrolinx Secure Tunnel.

## Usage

### Command-Line Options

To see the list of available command-line options, invoke the program
with the `-h` options.

Examples:

* On MS Windows `secure-tunnel-windows-x64-8.6.0.exe -h`
* On OSX and Linux: `secure-tunnel -h`

```text
Usage: secure-tunnel [options] <local-URL->server-URL ...>

Acrolinx Secure Tunnel

Options:
  -V, --version                              output the version number
  -v, --verbose                              show accessed URLs
  -r, --requests                             show requests and responses
  -s, --silent                               don't show info messages & status page
  -p, --proxy <proxy server URL>             use the given proxy server
  -S, --no-system_proxy                      don't use windows system proxy
  -E, --no-evnironment_proxy                 don't use env proxy server
  -a, --autorun                              add current configuration to autorun (windows only)
  -C, --no-secure                            no certificate validation
  -k, --key <key.pem>                        private key file
  -c, --cert <cert.pem>                      certificate file
  -e, --passphrase <private key passphrase>  password for private key
  -i, --info_url <local url>                 the local URL that will show the Acrolinx Secure Tunnel status page
  -o, --sso <username:generic token>         add single sign-on headers to all calls
  -t, --store <certificate store file>       use a custom certificate store
  -n, --token <authorization token>          add an authorization token to all requests
  -h, --help                                 output usage information
  ```

### Warnings and Restrictions

In general, note that this tool is very versatile and can be used in
many different ways. Make sure that you only enable the options
required for your use case.

1. Signing in to the Dashboard of the Acrolinx Platform using Acrolinx
   Secure Tunnel doesn't work in all cases. If the Acrolinx Sign-in page
    opens a URL on localhost (like
   `http://localhost:8031/dashboard.html?login=something-long`) and
   doesn't work reliably, manually modify the URL to contain the
   original address
   (`https://your-acrolinx.example.com/dashboard.html?login=something-long`).
2. Never use `-C` in production. It makes your communication unsecure.
3. Acrolinx Secure Tunnel does a self-test at startup time. It tries
   to connect to all relevant addresses. Sometimes, the test itself
   may fail even if the connection works later on. For example, if you
   start a tunnel with a custom certificate, but without a custom
   certificate store, then the certificate is not yet trusted at test
   time.
4. Acrolinx Secure Tunnel runs with normal user permissions most of
   the time. Only if you want to open a local port < 1024 on a
   POSIX-like system, you need root permissions.
5. Acrolinx Secure Tunnel listens on the address you specify. If you
   want to restrict the tunnel access to your local computer, specify
   `http://localhost:8031`. If you want to allow connections via your
   computer from other computers, use your external computer name
   instead of "localhost".
6. If you're happy with your current configuration and want to start
   it automatically, just add `-a`. This adds Acrolinx Secure Tunnel
   with the given settings to Windows AutoRun. If you want to remove
   it again later, use `regedit`, navigate to
   `HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run`,
   and delete the key `acrolinx_secure_tunnel`, or use [Sysinternals
   Autoruns for
   Windows](https://technet.microsoft.com/de-de/sysinternals/bb963902.aspx).
7. If you want to run Acrolinx Secure Tunnel on Windows without a
   command window, have a look at the command-line tool
   [Start](https://technet.microsoft.com/en-us/library/cc770297).
8. Sometimes the shell is a beast. Be careful when adding parameters
   that require escaping. For example, if you specify `local->server`
   instead of `"local->server"` as a parameter, the shell will pipe
   everything into a file called `server` and deny execution with the
   message: `The filename, directory name, or volume label syntax is
   incorrect.`.
9. Acrolinx Secure Tunnel will automatically set the
    `X-Acrolinx-Base-URL` header if not already set. This will let
    Classic Acrolinx Integrations retrieve the Scorecard, even if
    the external base URL isn't set properly.
10. For each local address + proxy + target address, a hash is
    created. This hash is used for all log messages. It looks like
    this: `7607eb3b Starting [...]`. Later messages have the same
    hash at the beginning of the line: `7607eb3b Started [...]`. This
    helps you find out which connection the log messages belong
    to. The hash is reproducible. Whenever you use the same
    combination, you'll get the same hash. This is also helpful if
    you want to compare your secure-tunnel configuration with a
    configuration on another computer.

### Use Cases

#### Acrolinx Platform with Custom Certificate for HTTPS

When your Acrolinx Platform is secured by a certificate not supported
by all of your integrations, you can use Acrolinx Secure Tunnel to
handle the SSL termination.

1. Start the HTTP to HTTPS tunnel:

    ```bash
    secure-tunnel "http://localhost:8031->https://test-ssl.acrolinx.com" -t ca.pem
    ```

2. Connect your integration to `http://localhost:8031`.

_Keep in mind that all used certificates have to be in `ca.pem`
otherwise the connection will fail. Even the default root certificates
aren't trusted any more._

#### Local Access for an HTTPS-Secured Acrolinx Platform

This can be used in case your Acrolinx Platform runs on the latest
security standards, but you use an integration without an available
upgrade.

1. Start the HTTP to HTTPS tunnel:

    ```bash
    secure-tunnel "http://localhost:8031->https://test-ssl.acrolinx.com"
    ```

2. Connect your integration to `http://localhost:8031`.

#### Analyze Traffic Between Integration and Platform

This is a use-case for developers and network administrator who need
to troubleshoot connection problems.

```bash
secure-tunnel -v -r "http://localhost:8031->http://test.acrolinx.com:8031"
```

* `"http://localhost:8031->http://test.acrolinx.com:8031"` maps `http`
  port `8031` on `localhost` to `http` port `8031` on
  `test.acrolinx.com`.
* `-v` shows headers
* `-r` shows requests and responses

Acrolinx Secure Tunnel transparently decompresses the content if it’s
gzip encoded.

*Keep in mind `-v` will slow down the speed a bit. `-r` will slow it down
more.*

**Warning: while using `-v`, `-r`, even in combination with the option
`-s`, passwords, tokens, or sensitive data are printed to the
console.**

#### Acrolinx Behind Proxy

Some Acrolinx Integrations run in environments where you can't defined
proxy settings or the default proxy settings aren’t picked up. In
those cases, Acrolinx Secure Tunnel allows tunneling the communication
through the proxy.

##### Custom Proxy

1. Let `secure-tunnel` start an HTTP to HTTPS tunnel:

```bash
secure-tunnel "http://localhost:8031->https://test-ssl.acrolinx.com" -p "http://proxy:3128"
```

Connect your integration to `http://localhost:8031`.

* `-p`: the specified proxy server will be used. This will override a
  defined system proxy.

Internally the
[node-proxy-agent](https://github.com/TooTallNate/node-proxy-agent) is
used.

You can use several kinds of proxies that
[node-proxy-agent](https://github.com/TooTallNate/node-proxy-agent)
supports:

| Protocol    | Example                                                                                     |
| :---------: | :-----------------------------------------------------------------------------------------: |
| `http`      | `http://proxy-server-over-tcp.com:3128`                                                     |
| `https`     | `https://proxy-server-over-tls.com:3129`                                                    |
| `socks(v5)` | `socks://username:password@some-socks-proxy.com:9050` (username and password are optional)  |
| `socks5`    | `socks5://username:password@some-socks-proxy.com:9050` (username and password are optional) |
| `socks4`    | `socks4://some-socks-proxy.com:9050`                                                        |
| `pac`       | `pac+http://www.example.com/proxy.pac`                                                      |

##### Default Corporate Proxy

_Note: Windows only_

```bash
secure-tunnel "http://localhost:8031->https://test-ssl.acrolinx.com"
```

_Unless `-S` is specified, the system default proxy will be taken automatically._

1. Acrolinx Secure Tunnel uses the registry key
   `Computer\HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Internet
   Settings\ProxyEnable` to verify if a global proxy is enabled.
2. The value of
   `Computer\HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Internet
   Settings\ProxyServer` is used as a proxy server address.
3. `secure-tunnel` currently doesn't support different proxy
   configurations for certain protocols. Only the main system proxy
   is used.

#### SSL Access for an HTTP-Based Acrolinx Platform

This can be used in case your Acrolinx Platform still runs on HTTP,
but you want to use Acrolinx Integrations that require a secure
connection, for example an Acrolinx browser extension. This is a
solution that works on the local computer.

Node that you can also solve this on the Acrolinx Platform by setting
up a reverse proxy with SSL using Nginx.

1. [Generate a certificate](#certificate-generation).
2. Start the tunnel:

   ```bash
   secure-tunnel -k key.pem -c cert.pem -e password "https://localhost:4443->http://test.acrolinx.com:8031"
   ```

3. If you want to use that tunnel, you typically have to add the
   certificate as a trusted certificate in your browser.
4. Connect the integration to `https://localhost:4443`.
5. If you want to open the HTTP port as well, just add it as another
   option:

```bash
secure-tunnel  -k key.pem -c cert.pem -e password "https://localhost:443->http://test.acrolinx.com:8031" "http://localhost:8031->http://test.acrolinx.com:8031"
```

#### Set Up a Secure Tunnel

This is a rare use-case and we recomment you solve this with better
configurations of the Acrolinx Platform. We just document it here to
show the flexibility of Acrolinx Secure Tunnel.

Imagine, you want to connect two departments. One department already
uses Acrolinx, but without SSL. The second department should be able
to connect to simple HTTP as well. Between the two departments a
secure connection should be used, so that a third department can't
read the traffic.

1. Deny external access to the HTTP Acrolinx port on the Acrolinx
   Platform (`server_department1`), or the exposed endpoint
   (`endpoint_department1`).
2. Integrations in "department one" are still connected to
   `server_department1` or `endpoint_department1` as before.
3. [Generate a certificate](#certificate-generation) on the remote server.
4. Expose an HTTPS version to the outside world:

   ```bash
   secure-tunnel -k key.pem -c cert.pem -e password "https://endpoint_department1:8443->http://server_department1:8031"
   ```

5. Copy `cert.pem` to a computer inside your network of "department two".
6. Start the endpoint of "department two":

   ```bash
   secure-tunnel  -t cert.pem "http://endpoint_department2:8031->https://endpoint_department1:8443"
   ```

7. Integrations in "department two" connect to
   `http://endpoint_department2:8031`.

#### Ensure Correct SSO Configuration

You already configured [single
sign-on](https://support.acrolinx.com/hc/en-us/articles/207827495-Setting-Up-Your-Acrolinx-Server-for-Single-Sign-on)
for your Acrolinx Platform. You want to connect an integration like
AEM or Wordpress to your Platform, but something went wrong. You need
to troubleshoot the setup and use Acrolinx Secure Tunnel for
debugging.

![SSO Reverse Proxy Diagram](doc/sidebarArchitectureDiagram14.3.1.png)

1. Set up an SSO-proxy on your local computer:

   ```bash
   secure-tunnel "http://localhost:8031->https://test-ssl.acrolinx.com" --sso some_existing_username:generic_token
   ```

   This emulates the proxy inside the web server.

2. Test if you can access the Acrolinx URL:

   ```bash
   curl http://localhost:8031/sso/v1/authenticate
   ```

   This emulates the Acrolinx Integration running inside the browser.
   Instead of using [`curl`](https://en.wikipedia.org/wiki/CURL) you
   can also use a web browser to access the page
   `http://localhost:8031/sso/v1/authenticate`.

3. You'll get either an error message or a valid access token.

_Be careful with this option. Everyone who has access to the port of
the tunnel is automatically authenticated. This might be a security
breach._

### Certificate Generation

If you require a certificate and key pair, you can use the `openssl`
command to generate them:

```bash
openssl req -x509 -newkey rsa:2048 -keyout keytmp.pem -out cert.pem -days 365
openssl rsa -in keytmp.pem -out key.pem
```

The `cert.pem` can also be used directly as a certificate authority `-t
cert.pem`.

_Keep in mind: whenever you add a certificate to your trust store,
your system might trust this certificate even if a different address
is accessed. Keep your private key secure. Otherwise it will enable
attackers to perform man in the middle attacks on you._

## Development

This section is only relevant to you if you want to contribute to
Acrolinx Secure Tunnel or want to adjust it to your needs.

And when you're done with your changes, please consider contributing
your changes back. We're already looking forward to reviewing them and
see if other customers could benefit from them, too. Note that this
requires a (trivial) Contributor Agreement.

* [Nodejs =>8.6](https://nodejs.org/en/) must be installed.
* [VSCode](https://code.visualstudio.com/) is recommended.

### Fetch Dependencies

```bash
npm i
```

### Compile Code for Nodejs

```bash
npm run build
```

### Compile Binaries for All OS

```bash
npm run compile
```

### Run

```bash
npm run run
```

### Debug

#### Start Debugging Session

![Debug using VSCode.](doc/debug.png)

The debugger will stop at predefined breakpoints and jump to the
corresponding code.

#### Change Command Line

Goto [`package.json`](package.json) -> `scripts` and edit `debug`, or
`debugWithParams`. The inspect ports must match to the ports in
[`.vscode/launch.json`](.vscode/launch.json).
