-- 0004_add_stadium_table.sql

CREATE TABLE IF NOT EXISTS stadium (
    id INTEGER PRIMARY KEY CHECK (id = 1), -- Ensure only one row
    address TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL
);

-- Insert initial stadium data
INSERT OR IGNORE INTO stadium (id, address, lat, lng) VALUES (1, '대구 달성군 옥포읍 간경리 10 축구장', 35.6921586, 128.4162393);
