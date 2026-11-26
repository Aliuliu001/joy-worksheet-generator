# Joy server deployment

- Fork: https://github.com/Aliuliu001/joy-worksheet-generator
- Upstream: https://github.com/tuanhuytruong/joy-worksheet-generator
- SSH alias: `joy`; project path: `/opt/ws-gen`
- Public hostname: `worksheet.srv.io.vn`
- Cloudflare Tunnel origin (connector on same host): `http://127.0.0.1:3101`
- Service: `ws-gen.service`, enabled at boot, runs as `ubuntu`.
- Port 3101 binds only to localhost; use Cloudflare Tunnel, not an open firewall port. A connector on another host/container must have routing configured separately.

## Separate workflows

- `npm run dev`: original AI Studio development command, port **3000**, unchanged.
- `npm start`: serves production `dist/` on localhost **3101**, fails rather than switching port if occupied.
- `npm run dev:public`: optional development alternative on 3101; stop ws-gen.service before using it. Do not run both on the same port.
- Public hostname is explicitly allowed through `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` in the systemd unit.

## Updating

On joy: pull the fork, run `npm ci`, `npm run lint`, `npm run build`, then `sudo systemctl restart ws-gen`.
Verify with `systemctl is-active ws-gen` and `curl -I -H 'Host: worksheet.srv.io.vn' http://127.0.0.1:3101/`.
Service logs: `journalctl -u ws-gen -n 50 --no-pager`.

## Dependency compatibility

The upstream esbuild ^0.25 dependency conflicts with Vite 8's optional peer range. This fork uses esbuild ^0.28 and commits package-lock.json for reproducible npm installs. No worksheet logic is changed.

## Verification scope

Deployment checks cover TypeScript, production build, HTTP entry point and generated assets. Worksheet generation/PDF behavior and AI features need separate functional testing. No Gemini secret is deployed or committed here.
