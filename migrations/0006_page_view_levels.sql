-- 頁面裡的細項(分頁、下拉選單)：最多三層，例如 ETF研究 › 主動式ETF › A 系列 ETF 跟單；換頁本身三層都是 NULL
ALTER TABLE page_views ADD COLUMN l1 TEXT;
ALTER TABLE page_views ADD COLUMN l2 TEXT;
ALTER TABLE page_views ADD COLUMN l3 TEXT;
