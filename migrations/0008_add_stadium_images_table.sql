-- 0008_add_stadium_images_table.sql

-- Drop the old single image url column from the stadium table
ALTER TABLE stadium DROP COLUMN image_url;

-- Create a new table to store multiple image URLs for the stadium
CREATE TABLE stadium_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image_url TEXT NOT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert a default placeholder image
INSERT INTO stadium_images (image_url) VALUES ('https://images.unsplash.com/photo-1522778119026-d647f0565c6d?q=80&w=2070&auto=format&fit=crop');
