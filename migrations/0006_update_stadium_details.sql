-- 0006_update_stadium_details.sql

UPDATE stadium 
SET 
  description = '* 주차장 완비 / 천연 구장 / 매주 일요일 am 8:00 ~ 12:00',
  contact_info = '총무: 010-5067-4528
주장: 010-5067-4528'
WHERE id = 1;
