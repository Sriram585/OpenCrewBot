// Module F & H: Deterministic Business Tools for Live Demos & Evaluations
// Pure TypeScript mathematics (zero hallucination) for CSV analytics and live text extraction.

export interface CsvAnalysisResult {
  rowCount: number;
  columns: string[];
  numericalSummaries: Record<string, { min: number; max: number; sum: number; average: number }>;
  segmentRevenue?: Array<{ segment: string; revenue: number; percentageOfTotal: number }>;
  funnelConversion?: {
    stages: Array<{ stage: string; count: number; conversionFromPrevious: number; dropoffCount: number }>;
    overallConversionRate: number;
    bottleneckStage?: string;
  };
  chartData: {
    barChart?: Array<{ label: string; value: number }>;
    funnelChart?: Array<{ step: string; value: number }>;
  };
}

/**
 * Parses raw CSV content (or filepath) and computes exact arithmetic statistics,
 * group-by segment revenue, and funnel conversion bottleneck drop-offs.
 */
export function analyzeCsv(csvContent: string): CsvAnalysisResult {
  const lines = csvContent
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    throw new Error("CSV requires a header row and at least one data row.");
  }

  // Parse header
  const headers = parseCsvLine(lines[0]);
  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] !== undefined ? values[j].trim() : "";
    }
    rows.push(row);
  }

  // Identify numerical columns
  const numericalSummaries: Record<string, { min: number; max: number; sum: number; average: number }> = {};
  for (const col of headers) {
    const numericVals: number[] = [];
    for (const r of rows) {
      const valStr = r[col].replace(/[\$,]/g, "");
      const num = Number(valStr);
      if (!isNaN(num) && r[col].length > 0) {
        numericVals.push(num);
      }
    }
    if (numericVals.length === rows.length && numericVals.length > 0) {
      const sum = numericVals.reduce((acc, v) => acc + v, 0);
      const min = Math.min(...numericVals);
      const max = Math.max(...numericVals);
      const average = Math.round((sum / numericVals.length) * 100) / 100;
      numericalSummaries[col] = {
        min,
        max,
        sum: Math.round(sum * 100) / 100,
        average,
      };
    }
  }

  // Segment Revenue calculation
  let segmentRevenue: Array<{ segment: string; revenue: number; percentageOfTotal: number }> | undefined;
  const segmentCol = headers.find((h) => /segment|category|region|tier|plan|cohort/i.test(h));
  const revenueCol = headers.find((h) => /revenue|amount|price|spend|total/i.test(h));

  if (segmentCol && revenueCol && numericalSummaries[revenueCol]) {
    const totalRev = numericalSummaries[revenueCol].sum;
    const revMap = new Map<string, number>();

    for (const r of rows) {
      const seg = r[segmentCol] || "Unknown";
      const val = Number(r[revenueCol].replace(/[\$,]/g, "")) || 0;
      revMap.set(seg, (revMap.get(seg) || 0) + val);
    }

    segmentRevenue = Array.from(revMap.entries())
      .map(([segment, rev]) => ({
        segment,
        revenue: Math.round(rev * 100) / 100,
        percentageOfTotal: totalRev > 0 ? Math.round((rev / totalRev) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }

  // Funnel Stage & Conversion Rate calculation
  let funnelConversion: CsvAnalysisResult["funnelConversion"];
  const stageCol = headers.find((h) => /stage|step|funnel|status/i.test(h));

  if (stageCol) {
    const stageCounts = new Map<string, number>();
    // Preserve stage order as they appear in the data
    const stageOrder: string[] = [];

    for (const r of rows) {
      const st = r[stageCol] || "unknown";
      if (!stageCounts.has(st)) stageOrder.push(st);
      stageCounts.set(st, (stageCounts.get(st) || 0) + 1);
    }

    const stages: Array<{ stage: string; count: number; conversionFromPrevious: number; dropoffCount: number }> = [];
    let previousCount = 0;
    let worstDropoffPct = 0;
    let bottleneckStage: string | undefined;

    for (let i = 0; i < stageOrder.length; i++) {
      const stageName = stageOrder[i];
      const count = stageCounts.get(stageName) || 0;

      if (i === 0) {
        stages.push({ stage: stageName, count, conversionFromPrevious: 100, dropoffCount: 0 });
        previousCount = count;
      } else {
        const dropoffCount = Math.max(0, previousCount - count);
        const convRate = previousCount > 0 ? Math.round((count / previousCount) * 1000) / 10 : 0;
        const dropoffPct = 100 - convRate;

        if (dropoffPct > worstDropoffPct) {
          worstDropoffPct = dropoffPct;
          bottleneckStage = stageName;
        }

        stages.push({
          stage: stageName,
          count,
          conversionFromPrevious: convRate,
          dropoffCount,
        });
        previousCount = count;
      }
    }

    const firstCount = stages[0]?.count || 0;
    const lastCount = stages[stages.length - 1]?.count || 0;
    const overallConversionRate = firstCount > 0 ? Math.round((lastCount / firstCount) * 1000) / 10 : 0;

    funnelConversion = {
      stages,
      overallConversionRate,
      bottleneckStage,
    };
  }

  // Prepare chart-ready dataset
  const chartData: CsvAnalysisResult["chartData"] = {};
  if (segmentRevenue) {
    chartData.barChart = segmentRevenue.map((s) => ({ label: s.segment, value: s.revenue }));
  }
  if (funnelConversion) {
    chartData.funnelChart = funnelConversion.stages.map((s) => ({ step: s.stage, value: s.count }));
  }

  return {
    rowCount: rows.length,
    columns: headers,
    numericalSummaries,
    segmentRevenue,
    funnelConversion,
    chartData,
  };
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let inQuotes = false;
  let current = "";

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map((s) => s.replace(/^"|"$/g, "").trim());
}

/**
 * Real live HTTP web fetcher that extracts clean, readable text from web pages.
 * Enforces timeout and reports explicit errors without hallucination.
 */
export async function webFetchResearch(
  url: string,
  timeoutMs = 8000,
): Promise<{ title?: string; text: string; url: string; contentLength: number }> {
  const abortCtrl = new AbortController();
  const timeout = setTimeout(() => abortCtrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: abortCtrl.signal,
      headers: {
        "User-Agent": "OpenCrewBot-Research-Agent/1.0",
        Accept: "text/html,application/xhtml+xml,text/plain",
      },
    });

    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    const html = await res.text();

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : undefined;

    // Clean HTML content
    const cleanText = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
      .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, " ")
      .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return {
      title,
      text: cleanText.slice(0, 8000),
      url,
      contentLength: cleanText.length,
    };
  } catch (err: unknown) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to fetch research from ${url}: ${msg}`);
  }
}
