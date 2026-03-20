import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

const quote = await yahooFinance.quote("ITUB4.SA");

const dividend12m = quote.trailingAnnualDividendRate ?? 0;
const bazinPrice = dividend12m / 0.06;

console.log(bazinPrice);