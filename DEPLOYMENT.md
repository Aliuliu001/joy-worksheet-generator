# Joy server deployment (PM2)

- Fork: https://github.com/Aliuliu001/joy-worksheet-generator
- Upstream: https://github.com/tuanhuytruong/joy-worksheet-generator
- SSH: `joy`; path: `/opt/ws-gen`; process owner: `ubuntu`.
- Public hostname: `worksheet.srv.io.vn`
- Cloudflare Tunnel origin on this server: `http://127.0.0.1:3101`.
- Manager: PM2, process name `ws-gen`, config `ecosystem.config.cjs`.
- Boot recovery: `pm2-ubuntu.service` + saved `/home/ubuntu/.pm2/dump.pm2`.
- Old standalone `ws-gen.service` is disabled/stopped; its repo file is retained only for reference/rollback. Do not enable it while PM2 is serving port 3101.

## Commands (run as ubuntu, not sudo pm2)

```sh
pm2 list
pm2 logs ws-gen --lines 50
pm2 restart ws-gen
pm2 stop ws-gen
pm2 start /opt/ws-gen/ecosystem.config.cjs
pm2 save
```

## Update deployment

```sh
cd /opt/ws-gen
git pull --ff-only origin main
npm ci
npm run lint
npm run build
pm2 startOrRestart ecosystem.config.cjs --update-env
pm2 save
curl --fail -I -H 'Host: worksheet.srv.io.vn' http://127.0.0.1:3101/
```

Stop the update if any command fails. Lint/build must succeed before restarting. Build updates are not atomic; arrange a quiet window for updates.

## Separate development

`npm run dev` retains AI Studio port **3000** unchanged. PM2 serves production dist on **3101**, loopback only. No Internet firewall port is required for a tunnel on the same host. A connector in a different container/host requires separate routing.

`npm run dev:public` is an optional development alternative on 3101: stop `ws-gen` in PM2 before using it. Do not run both together.

The exact public hostname is allowed in the PM2 environment through `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS`. No Gemini secret is deployed or committed.

## Compatibility and scope

Upstream esbuild ^0.25 conflicts with Vite 8's peer range; the fork uses ^0.28 and npm package-lock.json. No worksheet logic was changed. Deployment verification covers serving HTML/JS/CSS; worksheet/PDF and AI features require separate functional testing.
