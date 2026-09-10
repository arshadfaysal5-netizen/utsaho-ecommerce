# Deploying Utsaho to Production

Right now the site runs on your PC at `http://localhost:3000`. When you are ready to
go live (after buying a domain/hosting), this guide explains the options.

## 1. Choose a host

You need three things: a **web host**, a **domain**, and a **PostgreSQL database**.

| Option | Best for | Cost |
| ------ | -------- | ---- |
| **VPS** (DigitalOcean, Linode, Hetzner, Vultr) | Full control, cheap, production standard | $4–6/month |
| **Railway / Render** | Deploy directly from Git, has Postgres add-on | Free tiers + pay as you go |
| **Fly.io** | Simple deploy + managed Postgres | Cheap / pay as you go |

Recommended starter setup (cheapest, familiar):
- **Hetzner Cloud CX22** or **DigitalOcean Droplet** ($4–6/mo, Ubuntu 22.04)
- Postgres installed **on the same server** (no extra cost)

## 2. Get a domain

- Buy from Namecheap/Hostinger/GoDaddy, e.g. `utsaho.com` (~৳800–1400/yr).
- Point an `A` record to your server IP.
- Or use a free subdomain from the host (e.g. `utsaho.railway.app`) while testing.

## 3. Server setup (Ubuntu VPS)

```bash
# Node 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs postgresql postgresql-contrib nginx git

sudo -u postgres psql -c "CREATE USER utsaho WITH PASSWORD 'CHANGE_ME_STRONG_PASSWORD';"
sudo -u postgres psql -c "CREATE DATABASE utsaho OWNER utsaho;"
```

Promise-pull your code, then run the schema and seed the admin:

```bash
cd /var/www/utsaho
sudo -u postgres psql -d utsaho -f database/schema.sql
cd server && npm install
node seed-admin.js
```

## 4. Production environment

Edit `server/.env`:

```
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=utsaho
DB_USER=utsaho
DB_PASSWORD=CHANGE_ME_STRONG_PASSWORD
JWT_SECRET=paste-a-long-random-string
```

Generate a strong secret: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

> Important: In `script.js` and `admin.js`, replace
> `const API_BASE = 'http://localhost:3000'` with your real URL, e.g.
> `const API_BASE = 'https://www.utsaho.com'`.
> (Or better: change `API_BASE` to `''` so it uses the same origin, works in both
> localhost and production.)

## 5. Keep the server running (PM2)

```bash
sudo npm install -g pm2
cd /var/www/utsaho/server
pm2 start server.js --name utsaho
pm2 save
pm2 startup   # prints a command to auto-start on boot — run it
```

## 6. nginx reverse proxy + HTTPS

```bash
sudo nano /etc/nginx/sites-available/utsaho
```

```nginx
server {
    listen 80;
    server_name www.utsaho.com utsaho.com;

    client_max_body_size 15M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/utsaho /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Free HTTPS via Let's Encrypt
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d www.utsaho.com -d utsaho.com
```

`client_max_body_size 15M` is required so product images upload correctly.

## 7. Change admin + phone numbers

- Admin password: `server/seed-admin.js` starts with `admin123` — change your password
  after first login (delete `users` row and re-run, or add a "change password" feature).
- The store's live contact details are already set: WhatsApp/phone `01600164055`
  (WhatsApp link `8801600164055`), bKash/Nagad `01600-164055`, email
  `utsaho@gmail.com` in `index.html`, `script.js`, and `README.md`.

## 8. Backups

Add a daily cron job:

```bash
crontab -e
```
```
0 3 * * * /var/www/utsaho/database/backup.sh >> /var/www/utsaho/backups/cron.log 2>&1
```

Backups are saved to `backups/` (last 30 kept).

## 9. Go-live checklist

- [ ] `API_BASE` points to your real domain
- [ ] Admin password changed, JWT_SECRET set
- [ ] Real phone / bKash / Nagad / WhatsApp numbers
- [ ] HTTPS working (certbot)
- [ ] Backup cron running
- [ ] First test order placed on the live site