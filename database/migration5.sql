\c utsaho

-- Products: sale/original price (original_price > price = product on SALE)
ALTER TABLE products ADD COLUMN IF NOT EXISTS original_price NUMERIC(10,2);

ALTER TABLE products OWNER TO utsaho;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO utsaho;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO utsaho;