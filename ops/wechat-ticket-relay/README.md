# WeChat ticket relay

This relay exists because the WeChat Official Account API requires an IP allowlist while the main Cloudflare Worker does not have a stable ordinary egress IPv4.

Production path:

`Cloudflare Worker -> https://relay.gczhouwld.com/wechat/jsapi-ticket -> WeChat API`

The relay caches `access_token` and `jsapi_ticket` in memory and exposes the ticket only to callers that know `RELAY_SHARED_KEY`.

## Ubuntu install

On the fixed-public-IP server:

```bash
sudo apt-get update
sudo apt-get install -y git
sudo git clone https://github.com/zhou526316-sys/organic-synthesis-gallery.git /opt/organic-synthesis-gallery
cd /opt/organic-synthesis-gallery/ops/wechat-ticket-relay
sudo ./install-ubuntu.sh
```

The script prompts for the WeChat Official Account AppSecret without echoing it, stores secrets under `/etc/osg-wechat-relay/env` with mode 600, runs the relay container only on `127.0.0.1:8788`, and configures nginx on port 80.

Before requesting TLS, point `relay.gczhouwld.com` to the server's fixed public IPv4 and allow inbound TCP 80/443 in the cloud firewall.

Then:

```bash
sudo certbot --nginx -d relay.gczhouwld.com --redirect --agree-tos --register-unsafely-without-email
curl https://relay.gczhouwld.com/health
```

Do not expose port 8788 publicly.

## GitHub repository secrets

Set:

- `WECHAT_TICKET_RELAY_URL=https://relay.gczhouwld.com/wechat/jsapi-ticket`
- `WECHAT_TICKET_RELAY_KEY=<the same RELAY_SHARED_KEY stored on the server>`

Never commit the Official Account AppSecret or the relay shared key.
