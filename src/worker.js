const API_ROOT = "http://openapi.seoul.go.kr:8088";
const SALE_SERVICE = "tbLnOpendataRtmsV";
const GU_CODES = {
  "종로구":"11110", "중구":"11140", "용산구":"11170", "성동구":"11200", "광진구":"11215",
  "동대문구":"11230", "중랑구":"11260", "성북구":"11290", "강북구":"11305", "도봉구":"11320",
  "노원구":"11350", "은평구":"11380", "서대문구":"11410", "마포구":"11440", "양천구":"11470",
  "강서구":"11500", "구로구":"11530", "금천구":"11545", "영등포구":"11560", "동작구":"11590",
  "관악구":"11620", "서초구":"11650", "강남구":"11680", "송파구":"11710", "강동구":"11740"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=900" }
  });
}

function normalizeRow(row) {
  const value = (key, ...aliases) => {
    for (const name of [key, ...aliases]) if (row[name] != null) return row[name];
    return "";
  };
  return {
    year: String(value("ACC_YEAR", "RCPT_YR")),
    gu: String(value("SGG_NM", "CGG_NM")),
    dong: String(value("BJDONG_NM", "STDG_NM")),
    dongCode: String(value("BJDONG_CD", "STDG_CD")),
    date: String(value("DEAL_YMD", "CTRT_DAY")),
    price: Number(String(value("OBJ_AMT", "THING_AMT", "물건금액")).replaceAll(",", "")),
    area: Number(value("BLDG_AREA", "ARCH_AREA", "RENT_AREA", "건물면적")),
    floor: value("FLOOR", "FLR", "층"),
    name: String(value("BLDG_NM", "건물명")),
    type: String(value("HOUSE_TYPE", "BLDG_USG", "건물용도")),
    built: String(value("BUILD_YEAR", "ARCH_YR", "건축년도"))
  };
}

async function fetchYear(key, year, guCode, guName, dongCode) {
  const all = [];
  let total = 0;
  // Limit per request to protect the public API quota; the filters scope the data
  // to the selected district and, when supplied, the selected legal dong.
  for (let start = 1; start <= 20000; start += 1000) {
    const filters = [year, guCode, guName];
    if (dongCode) filters.push(dongCode);
    const path = [key, "json", SALE_SERVICE, start, start + 999, ...filters]
      .map(part => encodeURIComponent(String(part))).join("/");
    const response = await fetch(`${API_ROOT}/${path}`, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`서울시 API 응답 오류 (${response.status})`);
    const body = await response.json();
    const service = body[SALE_SERVICE];
    if (!service) {
      const error = body.RESULT?.MESSAGE || "서울시 API 응답을 확인할 수 없습니다.";
      throw new Error(error);
    }
    total = Number(service.list_total_count || 0);
    all.push(...(service.row || []));
    if (all.length >= total || (service.row || []).length < 1000) break;
  }
  return all.map(normalizeRow).filter(r => r.price > 0 && r.area > 0);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
      if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
      if (!env.SEOUL_OPEN_API_KEY) return json({ error: "API 키가 설정되지 않았습니다. Cloudflare Secret SEOUL_OPEN_API_KEY를 등록하세요." }, 503);
      try {
        if (url.pathname === "/api/districts") return json(Object.keys(GU_CODES));
      if (url.pathname !== "/api/sales" && url.pathname !== "/api/dongs") return json({ error: "요청 경로를 찾을 수 없습니다." }, 404);
      const gu = url.searchParams.get("gu");
      const dongCode = url.searchParams.get("dongCode") || "";
      if (!GU_CODES[gu]) return json({ error: "서울 자치구를 선택해 주세요." }, 400);
      const current = new Date().getFullYear();
      if (url.pathname === "/api/dongs") {
        const year = Number(url.searchParams.get("year") || current - 1);
        const path = [env.SEOUL_OPEN_API_KEY, "json", SALE_SERVICE, 1, 1000, year, GU_CODES[gu], gu]
          .map(part => encodeURIComponent(String(part))).join("/");
        const response = await fetch(`${API_ROOT}/${path}`);
        if (!response.ok) throw new Error(`서울시 API 응답 오류 (${response.status})`);
        const payload = await response.json();
        const rows = (payload[SALE_SERVICE]?.row || []).map(normalizeRow);
        const dongs = [...new Map(rows.filter(r => r.dong && r.dongCode).map(r => [r.dongCode, { name: r.dong, code: r.dongCode }])).values()]
          .sort((a, b) => a.name.localeCompare(b.name, "ko"));
        return json(dongs);
      }
      // Attempt five full calendar years; if older data is unavailable, retain
      // the most recent three successful years as the assignment minimum.
      const years = Array.from({ length: 5 }, (_, i) => current - i);
      const batches = await Promise.all(years.map(async year => {
        try { return { year, rows: await fetchYear(env.SEOUL_OPEN_API_KEY, year, GU_CODES[gu], gu, dongCode) }; }
        catch (error) { return { year, rows: [], error: error.message }; }
      }));
      const successful = batches.filter(batch => !batch.error);
      const selected = successful.length >= 5 ? successful : successful.filter(batch => batch.year >= current - 2);
      if (!selected.length) return json({ error: batches[0]?.error || "선택한 지역의 실거래가를 불러오지 못했습니다." }, 502);
      const rows = selected.flatMap(batch => batch.rows).filter(row => row.gu === gu);
      const monthly = Object.entries(rows.reduce((acc, row) => {
        const month = row.date.slice(0, 6);
        if (month.length !== 6) return acc;
        const item = acc[month] || (acc[month] = { month, total: 0, count: 0 });
        item.total += row.price / row.area;
        item.count += 1;
        return acc;
      }, {})).map(([, v]) => ({ month: v.month, avg: v.total / v.count, count: v.count })).sort((a, b) => a.month.localeCompare(b.month));
      return json({ gu, years: selected.map(b => b.year), monthly, count: rows.length,
        dongs: [...new Set(rows.map(r => r.dong).filter(Boolean))].sort(),
        rows: rows.slice(0, 5000), source: "서울 열린데이터광장 · 서울시 부동산 실거래가 정보" });
    } catch (error) {
      return json({ error: error.message || "데이터 조회 중 오류가 발생했습니다." }, 502);
    }
  }
};
