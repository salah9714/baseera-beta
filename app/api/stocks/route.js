import { SAUDI_STOCKS } from "../../../lib/stocks-config.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  var url = new URL(request.url);
  var code = url.searchParams.get("code");
  var type = url.searchParams.get("type") || "quote";

  try {
    var yahooFinance = (await import("yahoo-finance2")).default;

    // ── سهم محدد ──
    if (code) {
      var info = SAUDI_STOCKS[code];
      if (!info) {
        return Response.json({ error: "رمز غير موجود: " + code }, { status: 404 });
      }

      var symbol = code + ".SR";
      var quote = null;

      try {
        quote = await yahooFinance.quote(symbol);
      } catch (fetchErr) {
        return Response.json({
          error: "فشل جلب بيانات " + info.name,
          detail: fetchErr.message,
          hint: "Yahoo Finance قد يكون متعطل مؤقتاً. حاول بعد دقيقة.",
        }, { status: 502 });
      }

      if (!quote || !quote.regularMarketPrice) {
        return Response.json({
          error: "لا توجد بيانات لـ " + info.name,
          hint: "السوق قد يكون مغلقاً أو الرمز غير صحيح",
        }, { status: 404 });
      }

      var result = {
        code: code,
        name: info.name,
        en: info.en,
        sector: info.sector,
        price: quote.regularMarketPrice || 0,
        change: Math.round((quote.regularMarketChange || 0) * 100) / 100,
        changePct: Math.round((quote.regularMarketChangePercent || 0) * 100) / 100,
        open: quote.regularMarketOpen || 0,
        high: quote.regularMarketDayHigh || 0,
        low: quote.regularMarketDayLow || 0,
        prevClose: quote.regularMarketPreviousClose || 0,
        volume: quote.regularMarketVolume || 0,
        pe: Math.round((quote.trailingPE || 0) * 10) / 10,
        pb: Math.round((quote.priceToBook || 0) * 10) / 10,
        eps: Math.round((quote.trailingEps || 0) * 100) / 100,
        divYield: Math.round(((quote.dividendYield || 0) * 100) * 100) / 100,
        sma50: Math.round((quote.fiftyDayAverage || 0) * 100) / 100,
        sma200: Math.round((quote.twoHundredDayAverage || 0) * 100) / 100,
        high52w: quote.fiftyTwoWeekHigh || 0,
        low52w: quote.fiftyTwoWeekLow || 0,
        marketCap: quote.marketCap || 0,
        timestamp: new Date().toISOString(),
        source: "yahoo-finance",
        delay: "~15 دقيقة",
      };

      // ── بيانات كاملة ──
      if (type === "full") {
        try {
          var end = new Date();
          var start = new Date();
          start.setDate(start.getDate() - 45);
          var hist = await yahooFinance.historical(symbol, {
            period1: start.toISOString().split("T")[0],
            period2: end.toISOString().split("T")[0],
          });
          result.history = (hist || []).slice(-30).map(function (d) {
            return {
              date: d.date ? d.date.toISOString().split("T")[0] : "",
              open: Math.round((d.open || 0) * 100) / 100,
              high: Math.round((d.high || 0) * 100) / 100,
              low: Math.round((d.low || 0) * 100) / 100,
              close: Math.round((d.close || 0) * 100) / 100,
              volume: d.volume || 0,
            };
          });

          // ── RSI (حقيقي) ──
          var closes = result.history.map(function (d) { return d.close; });
          if (closes.length >= 15) {
            var gains = 0, losses = 0;
            for (var i = closes.length - 14; i < closes.length; i++) {
              var diff = closes[i] - closes[i - 1];
              if (diff > 0) gains += diff;
              else losses += Math.abs(diff);
            }
            var avgGain = gains / 14;
            var avgLoss = losses / 14;
            result.rsi = avgLoss === 0 ? 100 : Math.round(100 - (100 / (1 + avgGain / avgLoss)));
          } else {
            result.rsi = null;
          }

          // ── الدعم والمقاومة (من 30 يوم حقيقية) ──
          var highs = result.history.map(function (d) { return d.high; });
          var lows = result.history.map(function (d) { return d.low; });
          result.resistance = highs.length > 0 ? Math.round(Math.max.apply(null, highs) * 100) / 100 : null;
          result.support = lows.length > 0 ? Math.round(Math.min.apply(null, lows) * 100) / 100 : null;

          // ── نسبة الحجم ──
          if (result.history.length > 0 && result.volume > 0) {
            var avgVol = result.history.reduce(function (a, d) { return a + d.volume; }, 0) / result.history.length;
            result.volRatio = avgVol > 0 ? Math.round((result.volume / avgVol) * 100) / 100 : 1;
          }

          // ── ملاحظة: MACD يحتاج 26 يوم EMA - نعرض فرق السعر عن MA50 بدلاً من MACD المضلل ──
          result.priceVsMa50 = result.sma50 > 0 ? Math.round((result.price - result.sma50) * 100) / 100 : null;

        } catch (histErr) {
          result.history = [];
          result.historyError = "فشل جلب البيانات التاريخية";
        }
      }

      return Response.json(result);
    }

    // ── كل الأسهم (متوازي) ──
    var codes = Object.keys(SAUDI_STOCKS);
    var symbols = codes.map(function (c) { return c + ".SR"; });
    var allStocks = {};
    var errors = [];

    // جلب 5 أسهم بالتوازي في كل دفعة (لتجنب rate limit)
    for (var batch = 0; batch < codes.length; batch += 5) {
      var batchCodes = codes.slice(batch, batch + 5);
      var promises = batchCodes.map(function (c) {
        return yahooFinance.quote(c + ".SR").then(function (q) {
          if (q && q.regularMarketPrice) {
            var inf = SAUDI_STOCKS[c];
            allStocks[c] = {
              code: c,
              name: inf.name,
              en: inf.en,
              sector: inf.sector,
              price: q.regularMarketPrice || 0,
              change: Math.round((q.regularMarketChange || 0) * 100) / 100,
              changePct: Math.round((q.regularMarketChangePercent || 0) * 100) / 100,
              volume: q.regularMarketVolume || 0,
              high: q.regularMarketDayHigh || 0,
              low: q.regularMarketDayLow || 0,
              pe: Math.round((q.trailingPE || 0) * 10) / 10,
              divYield: Math.round(((q.dividendYield || 0) * 100) * 100) / 100,
              sma50: Math.round((q.fiftyDayAverage || 0) * 100) / 100,
              sma200: Math.round((q.twoHundredDayAverage || 0) * 100) / 100,
            };
          }
        }).catch(function (e) {
          errors.push(c + ": " + e.message);
        });
      });
      await Promise.all(promises);
    }

    return Response.json({
      stocks: allStocks,
      count: Object.keys(allStocks).length,
      total: codes.length,
      errors: errors.length > 0 ? errors : undefined,
      updated: new Date().toISOString(),
      source: "yahoo-finance",
      delay: "~15 دقيقة",
    });

  } catch (error) {
    return Response.json({
      error: "خطأ في الخادم",
      detail: error.message,
      hint: "حاول مرة أخرى بعد دقيقة",
    }, { status: 500 });
  }
}
