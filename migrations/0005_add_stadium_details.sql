-- 0005_add_stadium_details.sql

ALTER TABLE stadium ADD COLUMN description TEXT;
ALTER TABLE stadium ADD COLUMN contact_info TEXT;

UPDATE stadium 
SET 
  description = '* 주차장 완비 / 야간 조명 가능',
  contact_info = '총무: 010-1234-5678
주장: 010-9876-5432'
WHERE id = 1;

