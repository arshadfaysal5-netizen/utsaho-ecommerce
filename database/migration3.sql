\c utsaho

-- Orders: courier tracking
ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(150);

-- Back-in-stock notifications
CREATE TABLE IF NOT EXISTS stock_notifications (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    product_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    notified BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stock_notif_product ON stock_notifications(product_id);

-- Custom order requests
CREATE TABLE IF NOT EXISTS custom_orders (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(255),
    product_type VARCHAR(50),
    details TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE orders OWNER TO utsaho;
ALTER TABLE stock_notifications OWNER TO utsaho;
ALTER TABLE custom_orders OWNER TO utsaho;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO utsaho;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO utsaho;