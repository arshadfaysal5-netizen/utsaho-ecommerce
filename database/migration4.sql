\c utsaho

-- Custom orders: user link, image/video uploads, admin reply (price + product details)
ALTER TABLE custom_orders ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE custom_orders ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE custom_orders ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE custom_orders ADD COLUMN IF NOT EXISTS reply TEXT;
ALTER TABLE custom_orders ADD COLUMN IF NOT EXISTS reply_price NUMERIC(10,2);
ALTER TABLE custom_orders ADD COLUMN IF NOT EXISTS replied_at TIMESTAMP;

-- Contact messages: missing is_read flag (admin Messages tab needs it)
ALTER TABLE contact_messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false;

ALTER TABLE custom_orders OWNER TO utsaho;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO utsaho;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO utsaho;