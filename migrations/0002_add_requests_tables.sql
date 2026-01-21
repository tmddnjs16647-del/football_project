-- 0002_add_requests_tables.sql

-- Match Requests Table (매칭 신청)
CREATE TABLE IF NOT EXISTS match_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_name TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    contact TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Join Requests Table (입단 신청)
CREATE TABLE IF NOT EXISTS join_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    birth TEXT,
    position TEXT,
    contact TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
