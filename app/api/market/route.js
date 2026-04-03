export const dynamic = "force-dynamic";

export async function GET() {
  try {
    var yahooFinance = (await import("yahoo-finance2")).default;

    var tasi = null, oil = null;
    try { tasi = await yahooFinance.quote("^TASI.SR"); } catch(e) {}
    try { oil = await yahooFinance.quote("BZ=F"); } catch(e) {}

    var tasiData = {
      value: tasi ? tasi.regularMarketPrice || 0 : 0,
      change: tasi ? Math.round((tasi.regularMarketChangePercent || 0) * 100) / 100 : 0,
      sma200: tasi ? tasi.twoHundredDayAverage || 0 : 0,
      sma50: tasi ? tasi.fiftyDayAverage || 0 : 0,
    };
    var oilData = {
      price: oil ? Math.round((oil.regularMarketPrice || 0) * 100) / 100 : 0,
      change: oil ? Math.round((oil.regularMarketChangePercent || 0) * 100) / 100 : 0,
    };

    var score = 50;
    if (tasiData.value > tasiData.sma200) score += 15;
    if (tasiData.value > tasiData.sma50) score += 10;
    if (tasiData.change > 0) score += 5;
    if (oilData.price > 75) score += 8;
    if (oilData.change > 0) score += 3;

    var state, stateEn, multiplier, desc;
    if (score >= 80) { state = "صعود قوي"; stateEn = "Bull"; multiplier = 1.2; desc = "السوق في موجة صعود قوية"; }
    else if (score >= 65) { state = "صعود بحذر"; stateEn = "Bull Caution"; multiplier = 1.1; desc = "صعود مع انتقائية"; }
    else if (score >= 50) { state = "نطاق عرضي"; stateEn = "Range"; multiplier = 1.0; desc = "لا اتجاه واضح"; }
    else if (score >= 35) { state = "تحذير"; stateEn = "Bear Warning"; multiplier = 0.85; desc = "إشارات ضعف"; }
    else { state = "هبوط"; stateEn = "Bear"; multiplier = 0.7; desc = "حماية رأس المال"; }

    return Response.json({
      tasi: tasiData, oil: oilData,
      regime: { state: state, stateEn: stateEn, score: score, multiplier: multiplier, description: desc },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
