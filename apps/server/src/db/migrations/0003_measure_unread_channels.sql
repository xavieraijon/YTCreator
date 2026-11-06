-- Channels in a niche's results whose subscribers were not read, apart from those that hide them. Additive: old
-- measures keep NULL, which reads as «not known».
ALTER TABLE market_measure ADD COLUMN unread_channels INTEGER;
