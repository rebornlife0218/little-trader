-- 股票清單加上市場(上市、上櫃、創新板)與股本(億元，實收資本額)
ALTER TABLE symbols ADD COLUMN market TEXT;
ALTER TABLE symbols ADD COLUMN capital REAL;
