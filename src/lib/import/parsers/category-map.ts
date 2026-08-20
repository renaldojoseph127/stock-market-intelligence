export const CATEGORY_MAP={
 "NASDAQ MOST ACTIVE":"NASDAQ Most Active","NASDAQ BIGGEST GAINERS":"NASDAQ Biggest Gainers","NASDAQ BIGGEST DECLINERS":"NASDAQ Biggest Decliners",
 "NYSE MOST ACTIVE":"NYSE Most Active","NYSE BIGGEST GAINERS":"NYSE Biggest Gainers","NYSE BIGGEST DECLINERS":"NYSE Biggest Decliners",
 "OTC MOST ACTIVE":"OTC Most Active","OTC BIGGEST GAINERS":"OTC Biggest Gainers","OTC BIGGEST DECLINERS":"OTC Biggest Decliners",
 "MOST ACTIVE PENNY STOCKS":"Most Active Penny Stocks","BIGGEST PENNY STOCK GAINERS":"Biggest Penny Stock Gainers","BIGGEST PENNY STOCK DECLINERS":"Biggest Penny Stock Decliners",
} as const;
export const CANONICAL_CATEGORIES=Object.values(CATEGORY_MAP);
