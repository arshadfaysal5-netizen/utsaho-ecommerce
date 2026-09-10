# Utsaho — Handmade E-Commerce Site

**Utsaho** is a complete e-commerce website for selling handmade products (Candles,
Heritage Dresses, Home Decor, Soap, Jewelry, etc.). It runs on your computer
(Localhost) first; when you buy hosting/domain later, follow `DEPLOY.md`.

---

## Features at a Glance

| Area | Details |
| --- | --- |
| Shopping | 8 categories, search, sort, ratings & reviews, stock badges, image gallery |
| Cart | +/− quantity controls, stock-aware |
| Payments | Cash on Delivery (COD), bKash, Nagad |
| Delivery | Khulsi ৳30 / Chattogram City ৳50 / Outside City ৳100 / Pickup from Shop (FREE), free delivery over ৳2,000 |
| Coupons | Discount coupons (e.g. UTSAHO10) applied at checkout |
| Wishlist | Save favorite products when logged in |
| Stock alerts | "Notify me when back in stock" on out-of-stock items |
| Custom orders | Request a custom-made piece in your own design |
| Reviews | Only verified buyers can review (not before purchase) |
| WhatsApp | Every order instantly sends full details to your WhatsApp |
| Admin | Product/image upload, coupons, order tracking, messages, users, notifications |

---

## Setup & Run

### 1. Prerequisites
- **Node.js** v18+
- **PostgreSQL**

Install dependencies:
```bash
cd server
npm install
```

### 2. Database setup
From the PostgreSQL superuser account:

```bash
PGPASSWORD=4933 psql -U postgres -h localhost -f database/schema.sql
PGPASSWORD=4933 psql -U postgres -h localhost -f database/migration2.sql
PGPASSWORD=4933 psql -U postgres -h localhost -f database/migration3.sql
```

**Note:** If the database/user already exists, skip the first 3 lines of
`schema.sql` (`CREATE ROLE` / `CREATE DATABASE`) and just run the migration files —
they are repeatable and add any missing columns/tables.

### 3. Create the admin user
```bash
cd server
node seed-admin.js
```
> Admin email: **admin@utsaho.com** | Password: **admin123**

### 4. `.env` file
`server/.env` already exists. Edit if needed:

```
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=utsaho
DB_USER=utsaho
DB_PASSWORD=utsaho123
JWT_SECRET=some-long-random-text
```

### 5. Start the server
```bash
cd server
node server.js
```
Or in the background (WSL/Linux):
```bash
cd server
nohup node server.js > server.log 2>&1 < /dev/null &
```

### 6. Open the site
- Store: http://localhost:3000
- Admin panel: http://localhost:3000/admin.html

> After any CSS/JS change, press **Ctrl+Shift+R** (hard refresh) in the browser.

---

## Customer Side (Store)

- **Browsing:** 8 categories (Candle, Heritage Dresses, Home Decor, Soap & Cosmetics,
  Jewelry, Bags & Accessories, Festive Items, Jute Crafts) + search bar + sort
  (Newest / **Top Rated** / **On Sale** / Price Low-High / High-Low / Name A-Z).
- **Product card:** image, badges (Featured / New / **SALE**), stock badge (In Stock /
  Only X left / Out of Stock), average rating with count, ♥ wishlist button. On sale
  products show the crossed-out original price.
- **Product view:** multiple images (switchable thumbnails), description, ratings &
  reviews, "You May Also Like" (same category), 🔔 notify button when out of stock.
- **Cart:** +/− buttons to adjust quantity, stock-limited.
- **Checkout:** name/phone/address → delivery area → coupon (if any) →
  payment (COD/bKash/Nagad) → order. After ordering, WhatsApp (8801600164055)
  receives the full breakdown (items, subtotal, discount, delivery, total).
- **My Orders:** status (Pending → Confirmed → Shipped → Delivered), payment status,
  delivery area, discount, delivery fee, courier tracking number.
- **Reviews:** only purchasers can review one product per order (updatable).
- **Wishlist / Custom Order / Contact:** in the navbar and contact section.

---

## Admin Panel

**Login:** directly open **`http://localhost:3000/admin.html`** → `admin@utsaho.com` / `admin123`

> The "Admin" button is **hidden** from the store on purpose (security) — the panel is
> only reached by typing the `admin.html` URL directly. Bookmark it. The admin panel
> auto-logs-in if you are already logged in as admin on the store.

### How to upload a product (step by step for the admin)

1. Open **http://localhost:3000** and click the **Admin** button in the top navbar
   (or scroll to the footer and click **Admin Panel**).
2. Login with `admin@utsaho.com` / `admin123`.
3. You are on the **Products** tab. Click **"+ Add Product"** top-right.
4. Fill the form:
   - **Product Name** (e.g. "Lavender Scented Candle")
   - **Category** (Candle, Heritage Dresses, Home Decor, ...)
   - **Price (BDT)** and **Stock**
   - **Original Price (BDT)** — optional. Set it *higher* than Price to show a
     **SALE** badge with the crossed-out original price on the store.
   - **Description**
   - **Product Images** — click the image box and select the photo(s) from your
     computer. You can pick **up to 6 images; the first one becomes the main image.**
     A small preview strip appears before saving.
   - Tick **"Mark as Featured"** if you want a red Featured badge on the store.
5. Click **Save**. The product appears instantly on the store.
6. To edit later: use **Edit** next to the product. To remove: **Delete**.

> When the store is empty, the Products tab shows a big
> **"+ Add Your First Product"** button — click it to open the same form.

### Products tab (once products exist)
- Product list shows: image, name, category, price, stock (red if < 5), Featured badge,
  and **Edit / Feature / Delete** buttons. **Feature** toggles the Featured badge on/off
  without opening the form.

### Orders tab
- Each order shows: customer info, delivery area, discount/coupon, delivery fee.
- **Status** dropdown (Pending/Confirmed/Shipped/Delivered/Cancelled).
- **Payment** dropdown (Unpaid/Paid).
- **Courier + Tracking number** inputs → Save Tracking (customer sees it in My Orders).

### Coupons tab
- **+ New Coupon:** code + discount % (1–100). Enable/Disable/Delete.
- Customers type codes like `UTSAHO10` at checkout to get the % discount.

### Messages tab — 3 sections
1. **Contact Messages** — from the site contact form (new ones highlighted, click to mark read).
2. **Back-in-Stock Requests** — emails of customers waiting for stock + **Mark Notified**/Delete.
3. **Custom Order Requests** — custom order submissions (New badge, click to read).

### Users tab
List of registered users.

### Notification bell
Total of pending orders + new contact messages + new custom orders + un-notified
stock alerts; refreshes every 30 seconds.

---

## Database

| Table | Purpose |
| --- | --- |
| `users` | Customers + admin |
| `products` | Products (gallery[], featured, stock) |
| `orders` | Orders (delivery_area, delivery_fee, coupon_code, discount_amount, courier, tracking_number) |
| `order_items` | Products in each order |
| `reviews` | Verified-buyer reviews |
| `coupons` | Discount coupons |
| `wishlist` | Wishlist |
| `contact_messages` | Contact form messages |
| `stock_notifications` | "Notify me when in stock" requests |
| `custom_orders` | Custom order requests |

### Daily backup
```bash
database/backup.sh          # SQL dump into backups/, keeps last 30
```
For cron:
```
0 3 * * * /mnt/e/Utsaho/database/backup.sh
```

---

## File Structure

```
Utsaho/
├── index.html / styles.css / script.js   ← Store frontend
├── admin.html / admin.css / admin.js     ← Admin panel
├── favicon.svg                           ← Site icon
├── uploads/                              ← Product images uploaded by admin
├── server/
│   ├── server.js                         ← Main API (Express + PostgreSQL)
│   ├── db.js                             ← Database connection
│   ├── auth.js                           ← JWT (login/register/admin check)
│   ├── seed-admin.js                     ← Creates the admin account
│   └── .env                              ← Port + database config
├── database/
│   ├── schema.sql                        ← Full fresh install
│   ├── seed.sql                          ← (Optional) sample products
│   ├── migration2.sql / migration3.sql / migration4.sql   ← Feature upgrades
│   └── backup.sh                         ← Database backup script
└── DEPLOY.md                             ← Going-live guide
```

---

## API Cheat Sheet

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/auth/register`, `/api/auth/login` | Register / login |
| GET | `/api/products?category=&search=` | List / search / filter products |
| POST/PUT/DELETE | `/api/products` | Admin: manage products (with image upload) |
| GET | `/api/coupons/validate/:code` | Validate coupon (public) |
| POST | `/api/orders` | Place order (JWT = logged-in user, no token = guest) |
| PUT | `/api/orders/:id/status`, `/payment`, `/tracking` | Admin: update status/payment/tracking |
| GET/POST/DELETE | `/api/wishlist` | Wishlist |
| POST | `/api/stock-notify` | Back-in-stock request (public) |
| POST | `/api/custom-order` | Custom order request (image + video upload, multipart) |
| PUT | `/api/custom-orders/:id/reply` | Admin: reply with price + product details |
| GET | `/api/custom-orders/mine` | Customer: see own requests + admin reply |
| GET | `/api/orders/my` | Customer's own orders |
| GET | `/api/products/:id/can-review` | Check review eligibility |

---

## Going Live (Production)

After buying a domain/hosting, follow **`DEPLOY.md`** step by step
(VPS + nginx + PM2 + HTTPS + backup cron). Most important: change
`API_BASE = 'http://localhost:3000'` in `script.js` and `admin.js` to your real
domain (or set it to `''` so it uses the same origin).

---

© 2026 Utsaho — Khulsi, Chattogram, Bangladesh ❤